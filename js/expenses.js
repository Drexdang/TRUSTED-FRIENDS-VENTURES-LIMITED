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
        owners: [],
        // For individual owner detail view
        selectedOwner: null,
        showOwnerDetail: false,
        // For editing a transaction
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

        // View individual owner details
        viewOwner(owner) {
            this.selectedOwner = owner;
            this.showOwnerDetail = true;
        },

        // Filter transactions for selected owner
        get ownerTransactions() {
            if (!this.selectedOwner) return [];
            return this.equityTransactions.filter(t => t.owner === this.selectedOwner);
        },

        // Cumulative for selected owner
        get ownerNet() {
            return this.ownerTransactions.reduce((sum, t) => {
                return sum + (t.type === 'contribution' ? t.amount : -t.amount);
            }, 0);
        },

        // Edit transaction
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

        // Print individual owner statement
        printOwnerStatement() {
            if (!this.selectedOwner) return;
            generateOwnerEquityPDF(this.selectedOwner, this.ownerTransactions, this.ownerNet);
        },

        // Equity summary for all owners
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