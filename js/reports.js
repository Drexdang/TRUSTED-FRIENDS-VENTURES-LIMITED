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

        drillDownData: null,
        drillDownTitle: '',
        showDrillDown: false,

        outstandingList: [],
        selectedOutstandingClient: null,
        showOutstandingDetail: false,

        // NEW: Computed property for total outstanding amount
        get totalOutstandingAmount() {
            return this.outstandingList.reduce((sum, client) => sum + client.totalBalance, 0);
        },

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

        loadOutstanding() {
            const outstanding = {};
            this.loans.forEach(loan => {
                if (loan.balance > 0) {
                    if (!outstanding[loan.names]) {
                        outstanding[loan.names] = {
                            name: loan.names,
                            totalBalance: 0,
                            loans: []
                        };
                    }
                    outstanding[loan.names].totalBalance += loan.balance;
                    outstanding[loan.names].loans.push(loan);
                }
            });
            this.outstandingList = Object.values(outstanding).sort((a, b) => b.totalBalance - a.totalBalance);
        },

        viewOutstandingClient(client) {
            this.selectedOutstandingClient = client;
            this.showOutstandingDetail = true;
        },

        printOutstandingClientStatement() {
            if (!this.selectedOutstandingClient) return;
            generateClientOutstandingPDF(this.selectedOutstandingClient);
        },

        printAllOutstanding() {
            if (this.outstandingList.length === 0) {
                showToast('No outstanding balances to print', 'error');
                return;
            }
            generateAllOutstandingPDF(this.outstandingList);
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

            const totalPenalty = filteredLoans.reduce((sum, loan) => {
                const auto = loan.auto_penalty || 0;
                const manual = loan.manual_penalty || 0;
                const oldPenalty = loan.penalty_charged || 0;
                return sum + auto + manual + oldPenalty;
            }, 0);

            const revenue = {
                interest: filteredLoans.reduce((s, l) => s + (l.interest || 0), 0),
                adminFees: filteredLoans.reduce((s, l) => s + (l.admin_fees || 0), 0),
                penalty: totalPenalty
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
                finalPosition,
                rawLoans: filteredLoans,
                rawExpenses: filteredExpenses,
                rawIncome: filteredIncome
            };
            return this.plData;
        },

        showInterestDetails() {
            if (!this.plData) this.computePL();
            this.drillDownData = this.plData.rawLoans.map(l => ({
                sn: l.sn,
                names: l.names,
                amount: l.interest,
                date: l.date?.toDate().toLocaleDateString()
            })).filter(l => l.amount > 0);
            this.drillDownTitle = 'Interest Income Details';
            this.showDrillDown = true;
        },

        showAdminFeesDetails() {
            if (!this.plData) this.computePL();
            this.drillDownData = this.plData.rawLoans.map(l => ({
                sn: l.sn,
                names: l.names,
                amount: l.admin_fees,
                date: l.date?.toDate().toLocaleDateString()
            })).filter(l => l.amount > 0);
            this.drillDownTitle = 'Admin Fees Details';
            this.showDrillDown = true;
        },

        showPenaltyDetails() {
            if (!this.plData) this.computePL();
            this.drillDownData = this.plData.rawLoans.map(l => ({
                sn: l.sn,
                names: l.names,
                amount: (l.auto_penalty || 0) + (l.manual_penalty || 0) + (l.penalty_charged || 0),
                auto: l.auto_penalty || 0,
                manual: l.manual_penalty || 0,
                date: l.date?.toDate().toLocaleDateString()
            })).filter(l => l.amount > 0);
            this.drillDownTitle = 'Penalty Income Details';
            this.showDrillDown = true;
        },

        showOtherIncomeDetails(category) {
            if (!this.plData) this.computePL();
            this.drillDownData = this.plData.rawIncome
                .filter(inc => inc.category === category)
                .map(inc => ({
                    category: inc.category,
                    amount: inc.amount,
                    date: inc.date?.toDate().toLocaleDateString(),
                    description: inc.description
                }));
            this.drillDownTitle = `Other Income: ${category}`;
            this.showDrillDown = true;
        },

        showExpenseDetails(category) {
            if (!this.plData) this.computePL();
            this.drillDownData = this.plData.rawExpenses
                .filter(exp => exp.category === category)
                .map(exp => ({
                    category: exp.category,
                    amount: exp.amount,
                    date: exp.date?.toDate().toLocaleDateString(),
                    description: exp.description
                }));
            this.drillDownTitle = `Expenses: ${category}`;
            this.showDrillDown = true;
        },

        printDrillDown() {
            downloadCSV(this.drillDownData, `${this.drillDownTitle.replace(/\s/g, '_')}.csv`);
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