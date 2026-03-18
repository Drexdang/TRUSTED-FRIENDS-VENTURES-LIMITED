document.addEventListener('alpine:init', () => {
    Alpine.data('reports', () => ({
        activeReport: 'client',
        loans: [],
        expenses: [],
        income: [],
        equityTransactions: [],
        searchSN: '',
        selectedLoan: null,
        period: 'all',
        startDate: new Date(new Date().setMonth(new Date().getMonth()-12)).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        plData: null,

        init() {
            this.loadData();
            db.collection('loans').onSnapshot(snap => this.loans = snap.docs.map(d => ({ id: d.id, ...d.data() })));
            db.collection('expenses').onSnapshot(snap => this.expenses = snap.docs.map(d => ({ id: d.id, ...d.data() })));
            db.collection('otherIncome').onSnapshot(snap => this.income = snap.docs.map(d => ({ id: d.id, ...d.data() })));
            db.collection('equityTransactions').onSnapshot(snap => this.equityTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() })));
        },

        async loadData() {
            const [loansSnap, expSnap, incSnap, eqSnap] = await Promise.all([
                db.collection('loans').get(),
                db.collection('expenses').get(),
                db.collection('otherIncome').get(),
                db.collection('equityTransactions').get()
            ]);
            this.loans = loansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.expenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.income = incSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.equityTransactions = eqSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        },

        searchLoan() {
            if (!this.searchSN) return;
            const sn = Number(this.searchSN);
            this.selectedLoan = this.loans.find(l => l.sn === sn);
            if (!this.selectedLoan) showToast('Loan not found', 'error');
        },

        downloadClientPDF() {
            if (!this.selectedLoan) return;
            generateClientPDF(this.selectedLoan);
        },

        downloadClientCSV() {
            if (!this.selectedLoan) return;
            const data = [this.selectedLoan];
            downloadCSV(data, `loan_${this.selectedLoan.sn}.csv`);
        },

        computePL() {
            const filterByDate = (items) => {
                if (this.period === 'all') return items;
                const start = this.period === 'year' ? new Date(new Date().getFullYear(), 0, 1) :
                              this.period === '12months' ? new Date(new Date().setMonth(new Date().getMonth()-12)) :
                              new Date(this.startDate);
                const end = this.period === 'custom' ? new Date(this.endDate) : new Date();
                return items.filter(item => {
                    const d = item.date?.toDate ? item.date.toDate() : new Date(item.date);
                    return d >= start && d <= end;
                });
            };

            const filteredLoans = filterByDate(this.loans);
            const filteredExpenses = filterByDate(this.expenses);
            const filteredIncome = filterByDate(this.income);
            const filteredEquity = filterByDate(this.equityTransactions);

            // Calculate total penalty income: sum of auto_penalty + manual_penalty (or old penalty_charged)
            const totalPenalty = filteredLoans.reduce((sum, loan) => {
                // New fields
                const auto = loan.auto_penalty || 0;
                const manual = loan.manual_penalty || 0;
                // Old field for backward compatibility
                const oldPenalty = loan.penalty_charged || 0;
                return sum + auto + manual + oldPenalty;
            }, 0);

            const revenue = {
                interest: filteredLoans.reduce((s, l) => s + (l.interest || 0), 0),
                adminFees: filteredLoans.reduce((s, l) => s + (l.admin_fees || 0), 0),
                penalty: totalPenalty   // combined penalty income
            };

            const otherIncome = {};
            filteredIncome.forEach(inc => {
                otherIncome[inc.category] = (otherIncome[inc.category] || 0) + inc.amount;
            });
            const totalOther = filteredIncome.reduce((s, inc) => s + inc.amount, 0);
            const totalRevenue = revenue.interest + revenue.adminFees + revenue.penalty + totalOther;

            const expensesGroup = {};
            filteredExpenses.forEach(exp => {
                if (exp.category !== "Drawings") {
                    expensesGroup[exp.category] = (expensesGroup[exp.category] || 0) + exp.amount;
                }
            });
            const totalExpenses = Object.values(expensesGroup).reduce((a, b) => a + b, 0);

            const equitySummary = {};
            filteredEquity.forEach(t => {
                const amount = t.type === 'contribution' ? t.amount : -t.amount;
                equitySummary[t.owner] = (equitySummary[t.owner] || 0) + amount;
            });
            const totalNetEquity = Object.values(equitySummary).reduce((a, b) => a + b, 0);

            const netOperating = totalRevenue - totalExpenses;
            const finalPosition = netOperating + totalNetEquity;

            this.plData = {
                revenue,
                otherIncome,
                totalRevenue,
                expenses: expensesGroup,
                totalExpenses,
                equityPerOwner: equitySummary,
                totalEquity: totalNetEquity,
                netOperating,
                finalPosition
            };
            return this.plData;
        },

        downloadPLPDF() {
            if (!this.plData) this.computePL();
            if (!this.plData) return;
            const periodText = this.period === 'all' ? 'All Time' :
                               this.period === 'year' ? 'This Year' :
                               this.period === '12months' ? 'Last 12 Months' :
                               `${this.startDate} to ${this.endDate}`;
            generateProfitLossPDF(this.plData, periodText);
        },

        downloadPLCSV() {
            if (!this.plData) this.computePL();
            if (!this.plData) return;
            const flat = {
                Period: this.period,
                'Total Revenue': this.plData.totalRevenue,
                'Total Expenses': this.plData.totalExpenses,
                'Net Operating Profit': this.plData.netOperating,
                ...Object.fromEntries(Object.entries(this.plData.otherIncome).map(([k,v]) => [`Income: ${k}`, v])),
                ...Object.fromEntries(Object.entries(this.plData.expenses).map(([k,v]) => [`Expense: ${k}`, v])),
                ...Object.fromEntries(Object.entries(this.plData.equityPerOwner).map(([k,v]) => [`Equity: ${k}`, v])),
                'Total Net Equity': this.plData.totalEquity,
                'Final Position': this.plData.finalPosition
            };
            downloadCSV([flat], `profit_loss_${this.period}.csv`);
        }
    }));
});