import {
    auth,
    db,
    doc,
    onAuthStateChanged,
    setDoc
} from "./firebase.js";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const currentPath = window.location.pathname;
const isLoginPage = currentPath.includes("/pages/login.html");
const isDashboardPage = currentPath.includes("/pages/dashboard.html");

onAuthStateChanged(auth, (user) => {
    if (user && isLoginPage) {
        window.location.href = "./dashboard.html";
    }

    if (!user && isDashboardPage) {
        window.location.href = "./login.html";
    }
});

if (isLoginPage) {
    const authForm = document.getElementById("auth-form");
    const registerButton = document.getElementById("register-btn");
    const messageElement = document.getElementById("auth-message");

    const setMessage = (message, isError = false) => {
        messageElement.textContent = message;
        messageElement.style.color = isError ? "#ff8a8a" : "#9fffb0";
    };

    authForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = authForm.email.value.trim();
        const password = authForm.password.value.trim();

        try {
            await signInWithEmailAndPassword(auth, email, password);
            setMessage("Login effettuato. Reindirizzamento...");
            window.location.href = "./dashboard.html";
        } catch (error) {
            setMessage(getAuthErrorMessage(error), true);
        }
    });

    registerButton?.addEventListener("click", async () => {
        const email = authForm.email.value.trim();
        const password = authForm.password.value.trim();

        if (!email || !password) {
            setMessage("Inserisci email e password.", true);
            return;
        }

        try {
            const credential = await createUserWithEmailAndPassword(auth, email, password);
            const username = email.split("@")[0];

            await setDoc(doc(db, "users", credential.user.uid), {
                username,
                pfp: "",
                email
            }, { merge: true });

            setMessage("Registrazione completata. Reindirizzamento...");
            window.location.href = "./dashboard.html";
        } catch (error) {
            setMessage(getAuthErrorMessage(error), true);
        }
    });
}

if (isDashboardPage) {
    const logoutButton = document.getElementById("logout-btn");

    logoutButton?.addEventListener("click", async (event) => {
        event.preventDefault();

        try {
            await signOut(auth);
            window.location.href = "./login.html";
        } catch (error) {
            console.error("Errore logout:", error);
        }
    });
}

function getAuthErrorMessage(error) {
    switch (error.code) {
        case "auth/email-already-in-use":
            return "Questa email e' gia' registrata.";
        case "auth/invalid-email":
            return "Email non valida.";
        case "auth/weak-password":
            return "La password deve contenere almeno 6 caratteri.";
        case "auth/invalid-credential":
        case "auth/user-not-found":
        case "auth/wrong-password":
            return "Credenziali non valide.";
        default:
            return "Si e' verificato un errore. Controlla la configurazione Firebase.";
    }
}
