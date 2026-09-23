import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function getAdminFirestore() {
  const existingApp = getApps().find((app) => app.name === "porcafe-admin");
  if (existingApp) return getFirestore(existingApp);

  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const app = initializeApp({
    projectId,
    credential: serviceAccountJson
      ? cert(JSON.parse(serviceAccountJson))
      : applicationDefault(),
  }, "porcafe-admin");
  return getFirestore(app);
}
