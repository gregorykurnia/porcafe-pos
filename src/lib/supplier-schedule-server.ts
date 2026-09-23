import { addDays, addMonths, addWeeks, format, parseISO } from "date-fns";
import type { Firestore } from "firebase-admin/firestore";

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

function safeDocumentPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "schedule";
}

export async function runDueSupplierDeliverySchedules(
  firestore: Firestore,
  asOfDate: string,
  asOfTime: string,
): Promise<{ schedulesRun: number; movementIds: string[] }> {
  const setup = await firestore.doc("inventoryStockSetup/default").get();
  if (!setup.exists || !setup.get("initialized")) return { schedulesRun: 0, movementIds: [] };

  const schedulesSnapshot = await firestore.collection("inventorySupplierDeliverySchedules").where("active", "==", true).get();
  const movementIds: string[] = [];
  let schedulesRun = 0;

  for (const scheduleSnapshot of schedulesSnapshot.docs) {
    const scheduleRef = scheduleSnapshot.ref;
    const result = await firestore.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(scheduleRef);
      if (!currentSnapshot.exists) return { ran: false, movementId: null as string | null };
      const schedule = currentSnapshot.data() as SupplierDeliveryScheduleRecord;
      if (!schedule.active || schedule.nextRunOn > asOfDate) return { ran: false, movementId: null as string | null };

      const occurrenceOn = dueOccurrenceOnOrAfter(schedule, asOfDate);
      if (schedule.endOn && occurrenceOn > schedule.endOn) {
        transaction.set(scheduleRef, { active: false, nextRunOn: occurrenceOn, updatedAt: Date.now() }, { merge: true });
        return { ran: false, movementId: null as string | null };
      }
      if (occurrenceOn > asOfDate) {
        transaction.set(scheduleRef, { nextRunOn: occurrenceOn, updatedAt: Date.now() }, { merge: true });
        return { ran: false, movementId: null as string | null };
      }
      if ((schedule.executionTime ?? "08:00") > asOfTime) {
        if (occurrenceOn !== schedule.nextRunOn) {
          transaction.set(scheduleRef, { nextRunOn: occurrenceOn, updatedAt: Date.now() }, { merge: true });
        }
        return { ran: false, movementId: null as string | null };
      }

      const movementId = `scheduled-delivery-${safeDocumentPart(scheduleSnapshot.id)}-${safeDocumentPart(occurrenceOn)}`;
      const movementRef = firestore.doc(`inventoryMovements/${movementId}`);
      const existingMovement = await transaction.get(movementRef);
      const nextRunOn = advancePastDate(schedule, occurrenceOn, asOfDate);
      const stillActive = !schedule.endOn || nextRunOn <= schedule.endOn;
      const now = Date.now();

      if (!existingMovement.exists) {
        transaction.set(movementRef, {
          materialId: schedule.materialId,
          materialName: schedule.materialName,
          unit: schedule.unit,
          quantity: schedule.quantity,
          movementType: "receiving",
          occurredOn: occurrenceOn,
          reason: `Recurring supplier delivery received from ${schedule.supplierName}`,
          sourceRef: `supplier-delivery-schedule:${scheduleSnapshot.id}:${occurrenceOn}`,
          notes: schedule.notes,
          createdByType: "schedule",
          createdByLabel: "Automated recurring delivery",
          createdAt: now,
        });
      }
      transaction.set(scheduleRef, {
        lastRunOn: occurrenceOn,
        nextRunOn,
        active: stillActive,
        updatedAt: now,
      }, { merge: true });
      return { ran: !existingMovement.exists, movementId };
    });

    if (result.ran && result.movementId) {
      schedulesRun += 1;
      movementIds.push(result.movementId);
    }
  }

  return { schedulesRun, movementIds };
}
