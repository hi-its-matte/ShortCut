import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    getAuth,
    setPersistence,
    browserLocalPersistence,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
    // Inserisci qui le chiavi del tuo progetto Firebase se vuoi cambiarle.
    // Questo oggetto viene usato sia da Authentication che da Firestore.
    apiKey: "AIzaSyC7Tbqt5FzJK8Z_USkCMWxXiHZp8uRN26A",
    authDomain: "mattedev-account.firebaseapp.com",
    projectId: "mattedev-account",
    storageBucket: "mattedev-account.firebasestorage.app",
    messagingSenderId: "77268069903",
    appId: "1:77268069903:web:040aa6c3981eb3650afd7a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Errore persistenza sessione:", error);
});

export {
    app,
    auth,
    db,
    onAuthStateChanged,
    collection,
    addDoc,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc
};
