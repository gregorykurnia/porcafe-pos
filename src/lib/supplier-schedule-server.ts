import { addDays, addMonths, addWeeks, format, parseISO } from "date-fns";
import type { Firestore } from "firebase-admin/firestore";
import { buildScheduledDeliveryOrder, scheduledOrderId } from "./scheduled-delivery";
import type { InventoryUnit } from "./types";

type SupplierDeliveryScheduleRecord = {
  supplierId: string;
  supplierName: string;
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
  frequency: "daily" | "weekly" | "monthly" | "custom";
  customIntervalDays?: number;
  startOn: string;
  nextRunOn: string;
  executionTime?: string;
  endOn?: string;
  active: boolean;
  notes?: string;
};

function nextDeliveryDate(schedule: SupplierDeliveryScheduleRecord, date: string): string {
  const parsed = parseISO(date);
  const next = schedule.frequency === "daily"
    ? addDays(parsed, 1)
    : schedule.frequency === "weekly"
      ? addWeeks(parsed, 1)
      : schedule.frequency === "monthly"
        ? addMonths(parsed, 1)
        : addDays(parsed, schedule.customIntervalDays ?? 1);
  return format(next, "yyyy-MM-dd");
}

function dueOccurrenceOnOrAfter(schedule: SupplierDeliveryScheduleRecord, asOfDate: string): string {
  let occurrenceOn = schedule.nextRunOn;
  let guard = 0;
  while (occurrenceOn < asOfDate && guard < 20000) {
    occurrenceOn = nextDeliveryDate(schedule, occurrenceOn);
    guard += 1;
  }
  return occurrenceOn;
}

function advancePastDate(schedule: SupplierDeliveryScheduleRecord, occurrenceOn: string, asOfDate: string): string {
  let nextRunOn = nextDeliveryDate(schedule, occurrenceOn);
  let guard = 0;
  while (nextRunOn <= asOfDate && guard < 20000) {
    nextRunOn = nextDeliveryDate(schedule, nextRunOn);
    guard += 1;
  }
  return nextRunOn;
}

export async function runDueSupplierDeliverySchedules(
  firestore: Firestore,
  asOfDate: string,
  asOfTime: string,
): Promise<{ schedulesRun: number; orderIds: string[] }> {
  const setup = await firestore.doc("inventoryStockSetup/default").get();
  if (!setup.exists || !setup.get("initialized")) return { schedulesRun: 0, orderIds: [] };

  const schedulesSnapshot = await firestore.collection("inventorySupplierDeliverySchedules").where("active", "==", true).get();
  const orderIds: string[] = [];
  let schedulesRun = 0;

  for (const scheduleSnapshot of schedulesSnapshot.docs) {
    const scheduleRef = scheduleSnapshot.ref;
    const result = await firestore.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(scheduleRef);
      if (!currentSnapshot.exists) return { ran: false, orderId: null as string | null };
      const schedule = currentSnapshot.data() as SupplierDeliveryScheduleRecord;
      if (!schedule.active || schedule.nextRunOn > asOfDate) return { ran: false, orderId: null as string | null };

      const occurrenceOn = dueOccurrenceOnOrAfter(schedule, asOfDate);
      if (schedule.endOn && occurrenceOn > schedule.endOn) {
        transaction.set(scheduleRef, { active: false, nextRunOn: occurrenceOn, updatedAt: Date.now() }, { merge: true });
        return { ran: false, orderId: null as string | null };
      }
      if (occurrenceOn > asOfDate) {
        transaction.set(scheduleRef, { nextRunOn: occurrenceOn, updatedAt: Date.now() }, { merge: true });
        return { ran: false, orderId: null as string | null };
      }
      if ((schedule.executionTime ?? "08:00") > asOfTime) {
        if (occurrenceOn !== schedule.nextRunOn) {
          transaction.set(scheduleRef, { nextRunOn: occurrenceOn, updatedAt: Date.now() }, { merge: true });
        }
        return { ran: false, orderId: null as string | null };
      }

      // A due delivery opens a pending order for staff to confirm. It adds no stock yet.
      const orderRef = firestore.doc(`inventorySupplierOrders/${scheduledOrderId(scheduleSnapshot.id, occurrenceOn)}`);
      const existingOrder = await transaction.get(orderRef);
      const nextRunOn = advancePastDate(schedule, occurrenceOn, asOfDate);
      const stillActive = !schedule.endOn || nextRunOn <= schedule.endOn;
      const now = Date.now();

      if (!existingOrder.exists) {
        transaction.set(orderRef, buildScheduledDeliveryOrder({ ...schedule, id: scheduleSnapshot.id, unit: schedule.unit as InventoryUnit }, occurrenceOn, now));
      }
      transaction.set(scheduleRef, {
        lastRunOn: occurrenceOn,
        nextRunOn,
        active: stillActive,
        updatedAt: now,
      }, { merge: true });
      return { ran: !existingOrder.exists, orderId: orderRef.id };
    });

    if (result.ran && result.orderId) {
      schedulesRun += 1;
      orderIds.push(result.orderId);
    }
  }

  return { schedulesRun, orderIds };
}
