document.addEventListener('alpine:init', () => {
    Alpine.data('admin', () => ({
        users: [],
        newEmail: '',
        newPassword: '',
        equityOwners: ['Owner 1', 'Owner 2', 'Owner 3', 'Owner 4'],
        init() {
            this.loadUsers();
            this.loadEquityOwners();
        },
        async loadUsers() {
            const snapshot = await db.collection('users').get();
            this.users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        async loadEquityOwners() {
            const doc = await db.collection('settings').doc('equityOwners').get();
            if (doc.exists) {
                this.equityOwners = doc.data().owners || this.equityOwners;
            } else {
                await db.collection('settings').doc('equityOwners').set({ owners: this.equityOwners });
            }
        },
        async saveEquityOwners() {
            try {
                await db.collection('settings').doc('equityOwners').set({ owners: this.equityOwners });
                showToast('Equity contributors updated');
                window.dispatchEvent(new CustomEvent('equity-owners-updated'));
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        },
        async createUser() {
            if (!this.newEmail || !this.newPassword) {
                showToast('Email and password required', 'error');
                return;
            }
            try {
                const userCred = await auth.createUserWithEmailAndPassword(this.newEmail, this.newPassword);
                await db.collection('users').doc(userCred.user.uid).set({
                    email: this.newEmail,
                    role: 'admin',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                showToast('User created');
                this.newEmail = '';
                this.newPassword = '';
                this.loadUsers();
            } catch (error) {
                showToast(error.message, 'error');
            }
        },
        async deleteUser(userId, userUid) {
            if (userUid === auth.currentUser?.uid) {
                showToast('Cannot delete yourself', 'error');
                return;
            }
            if (!confirm('Delete this user?')) return;
            try {
                await db.collection('users').doc(userId).delete();
                showToast('User record deleted');
                this.loadUsers();
            } catch (error) {
                showToast(error.message, 'error');
            }
        }
    }));
});