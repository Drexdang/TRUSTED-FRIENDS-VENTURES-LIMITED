document.addEventListener('alpine:init', () => {
    Alpine.data('loans', () => ({
        loans: [],
        search: '',
        showAddForm: false,
        showEditForm: false,
        editingLoan: null,
        formData: {
            names: '',
            date: new Date().toISOString().split('T')[0],
            amount: '',
            int_rate: 5,
            duration: 3,
            admin_fees: 0,
            amt_remitted: 0
        },
        editFormData: {},
        init() {
            this.loadLoans();
            db.collection('loans').orderBy('sn', 'asc').onSnapshot(snapshot => {
                this.loans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            });
        },
        async loadLoans() {
            const snapshot = await db.collection('loans').orderBy('sn', 'asc').get();
            this.loans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        get filteredLoans() {
            const term = this.search.toLowerCase();
            return this.loans.filter(l => 
                l.names?.toLowerCase().includes(term) || l.sn?.toString().includes(term)
            );
        },
        resetForm() {
            this.formData = {
                names: '',
                date: new Date().toISOString().split('T')[0],
                amount: '',
                int_rate: 5,
                duration: 3,
                admin_fees: 0,
                amt_remitted: 0
            };
        },
        async addLoan() {
            try {
                const nextSN = await getNextLoanSN();
                const fields = calculateLoanFields(
                    Number(this.formData.amount),
                    Number(this.formData.int_rate),
                    Number(this.formData.duration),
                    Number(this.formData.admin_fees),
                    Number(this.formData.amt_remitted),
                    new Date(this.formData.date)
                );
                await db.collection('loans').add({
                    sn: nextSN,
                    names: this.formData.names,
                    date: firebase.firestore.Timestamp.fromDate(new Date(this.formData.date)),
                    amount: Number(this.formData.amount),
                    int_rate: Number(this.formData.int_rate),
                    duration: Number(this.formData.duration),
                    admin_fees: Number(this.formData.admin_fees),
                    amt_remitted: Number(this.formData.amt_remitted),
                    interest: fields.interest,
                    penalty_charged: fields.penalty,
                    total: fields.totalAdd,
                    g_total: fields.gTotal,
                    balance: fields.balance
                });
                showToast('Loan added successfully');
                this.showAddForm = false;
                this.resetForm();
            } catch (error) {
                showToast('Error adding loan: ' + error.message, 'error');
            }
        },
        editLoan(loan) {
            this.editingLoan = loan;
            this.editFormData = {
                names: loan.names,
                date: loan.date ? new Date(loan.date.seconds * 1000).toISOString().split('T')[0] : '',
                amount: loan.amount,
                int_rate: loan.int_rate,
                duration: loan.duration,
                admin_fees: loan.admin_fees,
                amt_remitted: loan.amt_remitted,
                penalty_charged: loan.penalty_charged
            };
            this.showEditForm = true;
        },
        async updateLoan() {
            try {
                const fields = calculateLoanFields(
                    Number(this.editFormData.amount),
                    Number(this.editFormData.int_rate),
                    Number(this.editFormData.duration),
                    Number(this.editFormData.admin_fees),
                    Number(this.editFormData.amt_remitted),
                    new Date(this.editFormData.date)
                );
                let penalty = fields.penalty;
                let balance = fields.balance;
                if (this.editFormData.penalty_charged > 0) {
                    penalty = Number(this.editFormData.penalty_charged);
                    const interest = this.editFormData.amount * (this.editFormData.int_rate / 100) * this.editFormData.duration;
                    const totalAdd = this.editFormData.admin_fees + interest + penalty;
                    const gTotal = this.editFormData.amount + totalAdd;
                    balance = 0;
                    fields.interest = interest;
                    fields.totalAdd = totalAdd;
                    fields.gTotal = gTotal;
                }
                await db.collection('loans').doc(this.editingLoan.id).update({
                    names: this.editFormData.names,
                    date: firebase.firestore.Timestamp.fromDate(new Date(this.editFormData.date)),
                    amount: Number(this.editFormData.amount),
                    int_rate: Number(this.editFormData.int_rate),
                    duration: Number(this.editFormData.duration),
                    admin_fees: Number(this.editFormData.admin_fees),
                    amt_remitted: Number(this.editFormData.amt_remitted),
                    interest: fields.interest,
                    penalty_charged: penalty,
                    total: fields.totalAdd,
                    g_total: fields.gTotal,
                    balance: balance
                });
                showToast('Loan updated');
                this.showEditForm = false;
                this.editingLoan = null;
            } catch (error) {
                showToast('Update failed: ' + error.message, 'error');
            }
        },
        async deleteLoan(loan) {
            if (!confirm(`Are you sure you want to delete loan SN ${loan.sn} – ${loan.names}?`)) return;
            try {
                await db.collection('loans').doc(loan.id).delete();
                showToast('Loan deleted');
            } catch (error) {
                showToast('Delete failed: ' + error.message, 'error');
            }
        }
    }));
});