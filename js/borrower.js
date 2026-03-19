document.addEventListener('alpine:init', () => {
    Alpine.data('borrower', () => ({
        borrowers: [],
        showAddForm: false,
        formData: {
            name: '',
            phone: '',
            address: '',
            idNumber: '',
            idType: 'National ID',
            guarantorName: '',
            guarantorPhone: '',
            notes: ''
        },
        editingBorrower: null,
        showEditModal: false,
        init() {
            this.loadBorrowers();
            db.collection('borrowers').orderBy('name', 'asc').onSnapshot(snap => {
                this.borrowers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            });
        },
        async loadBorrowers() {
            const snap = await db.collection('borrowers').orderBy('name', 'asc').get();
            this.borrowers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async addBorrower() {
            try {
                const docRef = await db.collection('borrowers').add({
                    ...this.formData,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                await logAudit('CREATE', 'borrowers', docRef.id, this.formData);
                showToast('Borrower added');
                this.resetForm();
                this.showAddForm = false;
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        },
        editBorrower(borrower) {
            this.editingBorrower = borrower;
            this.formData = { ...borrower };
            this.showEditModal = true;
        },
        async updateBorrower() {
            if (!this.editingBorrower) return;
            try {
                await db.collection('borrowers').doc(this.editingBorrower.id).update(this.formData);
                await logAudit('UPDATE', 'borrowers', this.editingBorrower.id, this.formData);
                showToast('Borrower updated');
                this.showEditModal = false;
                this.editingBorrower = null;
                this.resetForm();
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        },
        async deleteBorrower(borrower) {
            if (!confirm(`Delete borrower ${borrower.name}?`)) return;
            try {
                await db.collection('borrowers').doc(borrower.id).delete();
                await logAudit('DELETE', 'borrowers', borrower.id, { name: borrower.name });
                showToast('Borrower deleted');
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        },
        resetForm() {
            this.formData = {
                name: '',
                phone: '',
                address: '',
                idNumber: '',
                idType: 'National ID',
                guarantorName: '',
                guarantorPhone: '',
                notes: ''
            };
        }
    }));
});