// The material's preferredSupplierId is the single source of truth for the preferred
// supplier. A supplier link's "preferred" flag is a mirror of it, kept for history.

export type PreferredSupplierIssue = "missing-link" | "flag-disagrees";

export type PreferredSupplierDisagreement = {
  materialId: string;
  materialName: string;
  supplierId: string;
  issue: PreferredSupplierIssue;
};

type MaterialRef = { id: string; name: string; preferredSupplierId?: string };
type LinkRef = { supplierId: string; materialId: string; preferred: boolean };

/** Read-only check for the one-time reconciliation report (Setup → Data maintenance). */
export function findPreferredSupplierDisagreements(
  materials: MaterialRef[],
  links: LinkRef[]
): PreferredSupplierDisagreement[] {
  const problems: PreferredSupplierDisagreement[] = [];

  for (const material of materials) {
    const supplierId = material.preferredSupplierId;
    if (!supplierId) continue;
    const linked = links.some((link) => link.materialId === material.id && link.supplierId === supplierId);
    if (!linked) {
      problems.push({ materialId: material.id, materialName: material.name, supplierId, issue: "missing-link" });
    }
  }

  for (const link of links) {
    if (!link.preferred) continue;
    const material = materials.find((candidate) => candidate.id === link.materialId);
    if (!material || material.preferredSupplierId === link.supplierId) continue;
    problems.push({
      materialId: link.materialId,
      materialName: material?.name ?? link.materialId,
      supplierId: link.supplierId,
      issue: "flag-disagrees",
    });
  }

  return problems;
}
