// 데이터 저장소: Firebase Firestore의 reports 컬렉션
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp, doc, deleteDoc }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const db = getFirestore(initializeApp(firebaseConfig));

// 전체 보고 (최신순). 팀 4명 × 4주 규모라 한 번에 읽어도 충분
export async function loadReports() {
  const snap = await getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(1000)));
  return snap.docs.map((d) => {
    const v = d.data();
    return { id: d.id, ...v, createdAt: v.createdAt ? v.createdAt.toDate() : new Date() };
  });
}

export async function saveReport(data) {
  await addDoc(collection(db, "reports"), { ...data, createdAt: serverTimestamp() });
}

export async function deleteReport(id) {
  await deleteDoc(doc(db, "reports", id));
}
