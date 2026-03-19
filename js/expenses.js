document.addEventListener('alpine:init', () => {
    Alpine.data('expenses', () => ({
        expenses: [],
        otherIncome: [],
        equityTransactions: [],
        activeTab: 'expenses',
        expenseForm: { category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '' },
        incomeForm: { category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '' },
        equityForm: {
            owner: '',
            type: 'contribution',
            amount: '',
            date: new Date().toISOString().split('T')[0],
            description: ''
        },
        editingExpense: null,
        editingIncome: null,
        showExpenseEditModal: false,
        showIncomeEditModal: false,
        owners: [],
        selectedOwner: null,
        showOwnerDetail: false,
        editingTransaction: null,
        editForm: {
            owner: '',
            type: '',
            amount: '',
            date: '',
            description: ''
        },
        showEditModal: false,

        init() {
            this.loadOwners();
            this.loadExpenses();
            this.loadIncome();
            this.loadEquityTransactions();

            window.addEventListener('equity-owners-updated', () => this.loadOwners());

            db.collection('expenses').orderBy('date', 'desc').onSnapshot(snap => {
                this.expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            });
            db.collection('otherIncome').orderBy('date', 'desc').onSnapshot(snap => {
                this.otherIncome = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            });
            db.collection('equityTransactions').orderBy('date', 'desc').onSnapshot(snap => {
                this.equityTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            });
        },

        async loadOwners() {
            const doc = await db.collection('settings').doc('equityOwners').get();
            if (doc.exists) {
                this.owners = doc.data().owners || [];
            } else {
                this.owners = ['Owner 1', 'Owner 2', 'Owner 3', 'Owner 4'];
                await db.collection('settings').doc('equityOwners').set({ owners: this.owners });
            }
        },

        async loadExpenses() {
            const snap = await db.collection('expenses').orderBy('date', 'desc').get();
            this.expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async loadIncome() {
            const snap = await db.collection('otherIncome').orderBy('date', 'desc').get();
            this.otherIncome = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async loadEquityTransactions() {
            const snap = await db.collection('equityTransactions').orderBy('date', 'desc').get();
            this.equityTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },

        // Expense methods
        async addExpense() {
            try {
                await db.collection('expenses').add({
                    category: this.expenseForm.category,
                    amount: Number(this.expenseForm.amount),
                    date: firebase.firestore.Timestamp.fromDate(new Date(this.expenseForm.date)),
                    description: this.expenseForm.description || ''
                });
                showToast('Expense added');
                this.expenseForm = { category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '' };
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        },

        editExpense(exp) {
            this.editingExpense = exp;
            this.expenseForm = {
                category: exp.category,
                amount: exp.amount,
                date: exp.date ? new Date(exp.date.seconds * 1000).toISOString().split('T')[0] : '',
                description: exp.description || ''
            };
            this.showExpenseEditModal = true;
        },

        async updateExpense() {
            if (!this.editingExpense) return;
            try {
                await db.collection('expenses').doc(this.editingExpense.id).update({
                    category: this.expenseForm.category,
                    amount: Number(this.expenseForm.amount),
                    date: firebase.firestore.Timestamp.fromDate(new Date(this.expenseForm.date)),
                    description: this.expenseForm.description
                });
                showToast('Expense updated');
                this.showExpenseEditModal = false;
                this.editingExpense = null;
                this.expenseForm = { category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '' };
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        },

        async deleteExpense(exp) {
            if (!confirm('Delete this expense?')) return;
            try {
                await db.collection('expenses').doc(exp.id).delete();
                showToast('Expense deleted');
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        },

        // Income methods
        async addIncome() {
            try {
                await db.collection('otherIncome').add({
                    category: this.incomeForm.category,
                    amount: Number(this.incomeForm.amount),
                    date: firebase.firestore.Timestamp.fromDate(new Date(this.incomeForm.date)),
                    description: this.incomeForm.description || ''
                });
                showToast('Income added');
                this.incomeForm = { category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '' };
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        },

        editIncome(inc) {
            this.editingIncome = inc;
            this.incomeForm = {
                category: inc.category,
                amount: inc.amount,
                date: inc.date ? new Date(inc.date.seconds * 1000).toISOString().split('T')[0] : '',
                description: inc.description || ''
            };
            this.showIncomeEditModal = true;
        },

        async updateIncome() {
            if (!this.editingIncome) return;
            try {
                await db.collection('otherIncome').doc(this.editingIncome.id).update({
                    category: this.incomeForm.category,
                    amount: Number(this.incomeForm.amount),
                    date: firebase.firestore.Timestamp.fromDate(new Date(this.incomeForm.date)),
                    description: this.incomeForm.description
                });
                showToast('Income updated');
                this.showIncomeEditModal = false;
                this.editingIncome = null;
                this.incomeForm = { category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '' };
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        },

        async deleteIncome(inc) {
            if (!confirm('Delete this income record?')) return;
            try {
                await db.collection('otherIncome').doc(inc.id).delete();
                showToast('Income deleted');
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        },

        // Equity methods
        async addEquityTransaction() {
            if (!this.equityForm.owner || !this.equityForm.amount || Number(this.equityForm.amount) <= 0) {
                showToast('Please select owner and enter a positive amount', 'error');
                return;
            }
            try {
                await db.collection('equityTransactions').add({
                    owner: this.equityForm.owner,
                    type: this.equityForm.type,
                    amount: Number(this.equityForm.amount),
                    date: firebase.firestore.Timestamp.fromDate(new Date(this.equityForm.date)),
                    description: this.equityForm.description || ''
                });
                showToast('Equity transaction recorded');
                this.equityForm = {
                    owner: '',
                    type: 'contribution',
                    amount: '',
                    date: new Date().toISOString().split('T')[0],
                    description: ''
                };
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        },

        viewOwner(owner) {
            this.selectedOwner = owner;
            this.showOwnerDetail = true;
        },

        get ownerTransactions() {
            if (!this.selectedOwner) return [];
            return this.equityTransactions.filter(t => t.owner === this.selectedOwner);
        },

        get ownerNet() {
            return this.ownerTransactions.reduce((sum, t) => {
                return sum + (t.type === 'contribution' ? t.amount : -t.amount);
            }, 0);
        },

        editTransaction(tx) {
            this.editingTransaction = tx;
            this.editForm = {
                owner: tx.owner,
                type: tx.type,
                amount: tx.amount,
                date: tx.date ? new Date(tx.date.seconds * 1000).toISOString().split('T')[0] : '',
                description: tx.description || ''
            };
            this.showEditModal = true;
        },

        async updateTransaction() {
            if (!this.editingTransaction) return;
            try {
                await db.collection('equityTransactions').doc(this.editingTransaction.id).update({
                    owner: this.editForm.owner,
                    type: this.editForm.type,
                    amount: Number(this.editForm.amount),
                    date: firebase.firestore.Timestamp.fromDate(new Date(this.editForm.date)),
                    description: this.editForm.description
                });
                showToast('Transaction updated');
                this.showEditModal = false;
                this.editingTransaction = null;
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        },

        async deleteTransaction(tx) {
            if (!confirm('Delete this transaction?')) return;
            try {
                await db.collection('equityTransactions').doc(tx.id).delete();
                showToast('Transaction deleted');
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        },

        printOwnerStatement() {
            if (!this.selectedOwner) return;
            generateOwnerEquityPDF(this.selectedOwner, this.ownerTransactions, this.ownerNet);
        },

        get equitySummary() {
            const summary = {};
            this.owners.forEach(owner => { summary[owner] = 0; });
            this.equityTransactions.forEach(t => {
                const amount = t.type === 'contribution' ? t.amount : -t.amount;
                if (summary.hasOwnProperty(t.owner)) {
                    summary[t.owner] += amount;
                } else {
                    if (!summary['(Other)']) summary['(Other)'] = 0;
                    summary['(Other)'] += amount;
                }
            });
            return summary;
        },

        get totalEquity() {
            return Object.values(this.equitySummary).reduce((sum, val) => sum + val, 0);
        }
    }));
});