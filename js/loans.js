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
            amt_remitted: 0,
            manual_penalty: 0   // renamed from extra_penalty
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
                amt_remitted: 0,
                manual_penalty: 0
            };
        },
        async addLoan() {
            try {
                const nextSN = await getNextLoanSN();
                const amount = Number(this.formData.amount);
                const rate = Number(this.formData.int_rate);
                const duration = Number(this.formData.duration);
                const adminFees = Number(this.formData.admin_fees);
                const remitted = Number(this.formData.amt_remitted);
                const manualPenalty = Number(this.formData.manual_penalty);
                const loanDate = new Date(this.formData.date);

                const fields = calculateLoanFields(amount, rate, duration, adminFees, remitted, loanDate);
                const totalAdd = fields.totalAdd + manualPenalty;
                const gTotal = fields.gTotal + manualPenalty;
                const balance = Math.max(gTotal - remitted, 0);

                await db.collection('loans').add({
                    sn: nextSN,
                    names: this.formData.names,
                    date: firebase.firestore.Timestamp.fromDate(loanDate),
                    amount: amount,
                    int_rate: rate,
                    duration: duration,
                    admin_fees: adminFees,
                    amt_remitted: remitted,
                    interest: fields.interest,
                    auto_penalty: fields.autoPenalty,
                    manual_penalty: manualPenalty,   // saved as manual_penalty
                    total: totalAdd,
                    g_total: gTotal,
                    balance: balance
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
                auto_penalty: loan.auto_penalty || 0,
                manual_penalty: loan.manual_penalty || 0   // load manual_penalty
            };
            this.showEditForm = true;
        },
        async updateLoan() {
            try {
                const amount = Number(this.editFormData.amount);
                const rate = Number(this.editFormData.int_rate);
                const duration = Number(this.editFormData.duration);
                const adminFees = Number(this.editFormData.admin_fees);
                const remitted = Number(this.editFormData.amt_remitted);
                const autoPenalty = Number(this.editFormData.auto_penalty);
                const manualPenalty = Number(this.editFormData.manual_penalty);
                const loanDate = new Date(this.editFormData.date);

                const interest = amount * (rate / 100) * duration;
                const totalAdd = adminFees + interest + autoPenalty + manualPenalty;
                const gTotal = amount + totalAdd;
                const balance = Math.max(gTotal - remitted, 0);

                await db.collection('loans').doc(this.editingLoan.id).update({
                    names: this.editFormData.names,
                    date: firebase.firestore.Timestamp.fromDate(loanDate),
                    amount: amount,
                    int_rate: rate,
                    duration: duration,
                    admin_fees: adminFees,
                    amt_remitted: remitted,
                    interest: interest,
                    auto_penalty: autoPenalty,
                    manual_penalty: manualPenalty,
                    total: totalAdd,
                    g_total: gTotal,
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