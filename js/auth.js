function login(email, password) {
    return auth.signInWithEmailAndPassword(email, password)
        .then(() => showToast('Logged in successfully'))
        .catch(err => showToast(err.message, 'error'));
}

function logout() {
    return auth.signOut().then(() => showToast('Logged out'));
}

async function isAdmin(user) {
    if (!user) return false;
    try {
        const token = await user.getIdTokenResult();
        if (token.claims && token.claims.admin) return true;
        const doc = await db.collection('users').doc(user.uid).get();
        return doc.exists && doc.data().role === 'admin';
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
}

auth.onAuthStateChanged(async user => {
    const adminStatus = user ? await isAdmin(user) : false;
    window.dispatchEvent(new CustomEvent('auth-changed', {
        detail: { user, isAdmin: adminStatus }
    }));
});

window.login = login;
window.logout = logout;
window.isAdmin = isAdmin;