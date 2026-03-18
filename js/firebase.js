// Firebase initialization with your project config
const firebaseConfig = {
    apiKey: "AIzaSyBDfFpNKlV6PyXYR8x2CramvNmR5dWLKww",
    authDomain: "loan-manager-72782.firebaseapp.com",
    projectId: "loan-manager-72782",
    storageBucket: "loan-manager-72782.firebasestorage.app",
    messagingSenderId: "1091771495946",
    appId: "1:1091771495946:web:08dd8d9a090f788cd7d1f3",
    measurementId: "G-QYKFWM9F22"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true })
    .catch(err => console.warn('Firestore persistence error:', err));

window.auth = auth;
window.db = db;