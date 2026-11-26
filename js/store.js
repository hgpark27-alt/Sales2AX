// 데이터 저장소: Firebase Firestore의 reports 컬렉션
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp, doc, getDoc, setDoc, increment }
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

// ── 오늘 방문자 수: visits/<YYYYMMDD> 문서의 count. 같은 브라우저는 하루 1번만 셈 ──
const today = () => { const d = new Date(); return "" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); };

export async function countVisit() {
  const key = "ax-visit-" + today();
  try { if (localStorage.getItem(key)) return; } catch (e) {}
  await setDoc(doc(db, "visits", today()), { count: increment(1) }, { merge: true });
  try { localStorage.setItem(key, "1"); } catch (e) {}
}

export async function todayVisits() {
  const s = await getDoc(doc(db, "visits", today()));
  return s.exists() ? s.data().count : 0;
}

export async function resetVisits() {
  await setDoc(doc(db, "visits", today()), { count: 0 });
}
