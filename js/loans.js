document.addEventListener('alpine:init', () => {
    Alpine.data('loans', () => ({
        loans: [],
        borrowers: [],
        search: '',
        showAddForm: false,
        showEditForm: false,
        showAll: false,
        editingLoan: null,
        dateFilterType: 'all',
        customStartDate: new Date().toISOString().split('T')[0],
        customEndDate: new Date().toISOString().split('T')[0],
        showWriteOffModal: false,
        writeOffData: { loanId: null, reason: '' },
        
        formData: {
            names: '',
            borrowerId: '',
            date: new Date().toISOString().split('T')[0],
            amount: '',
            int_rate: 5,
            duration: 3,
            admin_fees: 0,
            amt_remitted: 0,
            manual_penalty: 0
        },
        editFormData: {},
        nameSuggestions: [],
        showSuggestions: false,
        filteredNames: [],

        init() {
            this.loadLoans();
            this.loadBorrowers();
            db.collection('loans').orderBy('sn', 'asc').onSnapshot(snapshot => {
                this.loans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.nameSuggestions = [...new Set(this.loans.map(l => l.names).filter(Boolean))];
            });
        },

        async loadLoans() {
            const snapshot = await db.collection('loans').orderBy('sn', 'asc').get();
            this.loans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.nameSuggestions = [...new Set(this.loans.map(l => l.names).filter(Boolean))];
        },

        async loadBorrowers() {
            const snapshot = await db.collection('borrowers').orderBy('name', 'asc').get();
            this.borrowers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        },

        // Search filter (by name or SN)
        get filteredLoans() {
            const term = this.search.toLowerCase();
            return this.loans.filter(l => 
                l.names?.toLowerCase().includes(term) || l.sn?.toString().includes(term)
            );
        },

        // Date filter
        get filteredLoansByDate() {
            const searchFiltered = this.filteredLoans;
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay());
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const startOfYear = new Date(today.getFullYear(), 0, 1);

            return searchFiltered.filter(loan => {
                if (!loan.date) return this.dateFilterType === 'all';
                const loanDate = loan.date.toDate ? loan.date.toDate() : new Date(loan.date);
                switch (this.dateFilterType) {
                    case 'all': return true;
                    case 'today': return loanDate >= today;
                    case 'week': return loanDate >= startOfWeek;
                    case 'month': return loanDate >= startOfMonth;
                    case 'year': return loanDate >= startOfYear;
                    case 'custom':
                        const start = new Date(this.customStartDate);
                        const end = new Date(this.customEndDate);
                        end.setHours(23, 59, 59, 999);
                        return loanDate >= start && loanDate <= end;
                    default: return true;
                }
            }).sort((a, b) => {
                const dateA = a.date ? new Date(a.date.seconds * 1000) : new Date(0);
                const dateB = b.date ? new Date(b.date.seconds * 1000) : new Date(0);
                return dateB - dateA;
            });
        },

        get displayedLoans() {
            const filtered = this.filteredLoansByDate;
            return this.showAll ? filtered : filtered.slice(0, 5);
        },

        // Autocomplete methods
        filterNames() {
            const input = this.formData.names.toLowerCase();
            this.filteredNames = this.nameSuggestions.filter(name => 
                name.toLowerCase().includes(input) && name.toLowerCase() !== input
            ).slice(0, 10);
        },
        selectName(name) {
            this.formData.names = name;
            this.showSuggestions = false;
        },
        resetAutocomplete() {
            this.filteredNames = [];
            this.showSuggestions = false;
        },

        // NEW: Update client name when borrower is selected
        updateNameFromBorrower() {
            if (this.formData.borrowerId) {
                const selected = this.borrowers.find(b => b.id === this.formData.borrowerId);
                if (selected) {
                    this.formData.names = selected.name;
                }
            }
        },

        // NEW: Update edit form name when borrower is selected in edit modal
        updateEditNameFromBorrower() {
            if (this.editFormData.borrowerId) {
                const selected = this.borrowers.find(b => b.id === this.editFormData.borrowerId);
                if (selected) {
                    this.editFormData.names = selected.name;
                }
            }
        },

        resetForm() {
            this.formData = {
                names: '',
                borrowerId: '',
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
                let overpayment = 0;
                if (remitted > gTotal) {
                    overpayment = remitted - gTotal;
                }

                const docRef = await db.collection('loans').add({
                    sn: nextSN,
                    names: this.formData.names,
                    borrowerId: this.formData.borrowerId || null,
                    date: firebase.firestore.Timestamp.fromDate(loanDate),
                    amount: amount,
                    int_rate: rate,
                    duration: duration,
                    admin_fees: adminFees,
                    amt_remitted: remitted,
                    interest: fields.interest,
                    auto_penalty: fields.autoPenalty,
                    manual_penalty: manualPenalty,
                    total: totalAdd,
                    g_total: gTotal,
                    balance: balance,
                    overpayment: overpayment
                });

                if (overpayment > 0) {
                    await db.collection('otherIncome').add({
                        category: 'Loan Overpayment',
                        amount: overpayment,
                        date: firebase.firestore.Timestamp.fromDate(loanDate),
                        description: `Overpayment on loan SN ${nextSN} - ${this.formData.names}`
                    });
                    showToast(`Overpayment of ${formatCurrency(overpayment)} recorded as other income`);
                }

                await logAudit('CREATE', 'loans', docRef.id, { sn: nextSN, names: this.formData.names });
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
                borrowerId: loan.borrowerId || '',
                date: loan.date ? new Date(loan.date.seconds * 1000).toISOString().split('T')[0] : '',
                amount: loan.amount,
                int_rate: loan.int_rate,
                duration: loan.duration,
                admin_fees: loan.admin_fees,
                amt_remitted: loan.amt_remitted,
                auto_penalty: loan.auto_penalty || 0,
                manual_penalty: loan.manual_penalty || 0
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
                let overpayment = 0;
                if (remitted > gTotal) {
                    overpayment = remitted - gTotal;
                }

                await db.collection('loans').doc(this.editingLoan.id).update({
                    names: this.editFormData.names,
                    borrowerId: this.editFormData.borrowerId || null,
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
                    balance: balance,
                    overpayment: overpayment
                });

                if (overpayment > 0) {
                    await db.collection('otherIncome').add({
                        category: 'Loan Overpayment',
                        amount: overpayment,
                        date: firebase.firestore.Timestamp.fromDate(loanDate),
                        description: `Overpayment on loan SN ${this.editingLoan.sn} - ${this.editFormData.names}`
                    });
                    showToast(`Overpayment of ${formatCurrency(overpayment)} recorded as other income`);
                }

                await logAudit('UPDATE', 'loans', this.editingLoan.id, { sn: this.editingLoan.sn, changes: this.editFormData });
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
                await logAudit('DELETE', 'loans', loan.id, { sn: loan.sn, names: loan.names });
                showToast('Loan deleted');
            } catch (error) {
                showToast('Delete failed: ' + error.message, 'error');
            }
        },

        async writeOffLoan() {
            if (!this.writeOffData.loanId || !this.writeOffData.reason) {
                showToast('Reason required', 'error');
                return;
            }
            try {
                const loan = this.loans.find(l => l.id === this.writeOffData.loanId);
                await db.collection('writtenOffLoans').add({
                    ...loan,
                    writeOffReason: this.writeOffData.reason,
                    writeOffDate: firebase.firestore.Timestamp.fromDate(new Date()),
                    writtenOffBy: auth.currentUser?.email
                });
                await db.collection('loans').doc(this.writeOffData.loanId).delete();
                await logAudit('WRITE_OFF', 'loans', this.writeOffData.loanId, { reason: this.writeOffData.reason, sn: loan.sn });
                showToast('Loan written off');
                this.showWriteOffModal = false;
                this.writeOffData = { loanId: null, reason: '' };
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        }
    }));
});