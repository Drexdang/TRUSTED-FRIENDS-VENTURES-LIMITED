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

        // Client search by name properties
        clientNameSearch: '',
        nameSearchResults: [],
        selectedClientLoans: [],
        selectedClientName: '',
        selectedClientTotalOutstanding: 0,
        searchMessage: '',

        // NEW: Computed property for total outstanding amount
        get totalOutstandingAmount() {
            return this.outstandingList.reduce((sum, client) => sum + client.totalBalance, 0);
        },

        init() {
            this.loadData();
            // Set up real-time listeners
            db.collection('loans').onSnapshot(snap => {
                this.loans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            });
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
            if (!this.searchSN) {
                showToast('Please enter a loan SN', 'error');
                return;
            }
            const sn = Number(this.searchSN);
            this.selectedLoan = this.loans.find(l => l.sn === sn);
            if (!this.selectedLoan) {
                showToast('Loan not found', 'error');
                this.searchMessage = `No loan found with SN: ${this.searchSN}`;
            } else {
                this.searchMessage = `Found loan SN: ${this.selectedLoan.sn} for ${this.selectedLoan.names}`;
                // Clear client search results when showing single loan
                this.selectedClientLoans = [];
                this.selectedClientName = '';
            }
        },

        downloadClientPDF() {
    if (!this.selectedLoan) return;
    
    // Make sure the selectedLoan has a properly formatted date
    const loanCopy = { ...this.selectedLoan };
    if (loanCopy.date) {
        try {
            if (loanCopy.date.toDate) {
                loanCopy.dateFormatted = loanCopy.date.toDate().toLocaleDateString();
            } else if (loanCopy.date.seconds) {
                loanCopy.dateFormatted = new Date(loanCopy.date.seconds * 1000).toLocaleDateString();
            }
        } catch (e) {
            loanCopy.dateFormatted = 'Invalid Date';
        }
    }
    
    generateClientPDF(loanCopy);
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
        },

        // Client search by name function - FIXED
        async searchClientByName() {
            console.log('Searching for:', this.clientNameSearch); // Debug log
            
            if (!this.clientNameSearch || this.clientNameSearch.trim().length < 2) {
                this.nameSearchResults = [];
                return;
            }
            
            const searchTerm = this.clientNameSearch.toLowerCase().trim();
            
            try {
                // Use the existing loans array instead of fetching again
                const clientMap = new Map();
                
                this.loans.forEach(loan => {
                    if (loan.names && loan.names.toLowerCase().includes(searchTerm)) {
                        if (!clientMap.has(loan.names)) {
                            clientMap.set(loan.names, {
                                name: loan.names,
                                loanCount: 0,
                                totalBalance: 0,
                                loans: []
                            });
                        }
                        const client = clientMap.get(loan.names);
                        client.loanCount++;
                        client.totalBalance += (loan.balance || 0);
                        client.loans.push(loan);
                    }
                });
                
                this.nameSearchResults = Array.from(clientMap.values());
                console.log('Search results:', this.nameSearchResults); // Debug log
                
                if (this.nameSearchResults.length === 0 && searchTerm.length >= 2) {
                    this.searchMessage = `No clients found matching "${this.clientNameSearch}"`;
                } else {
                    this.searchMessage = '';
                }
                
            } catch (error) {
                console.error('Search error:', error);
                this.showToast('Search failed: ' + error.message, 'error');
            }
        },
        
        selectClientByName(client) {
            console.log('Selected client:', client); // Debug log
            this.selectedClientName = client.name;
            this.selectedClientLoans = client.loans;
            this.selectedClientTotalOutstanding = client.totalBalance;
            this.selectedLoan = null;
            this.searchSN = '';
            this.clientNameSearch = client.name;
            this.nameSearchResults = [];
            this.searchMessage = `Found ${client.loanCount} loan(s) for ${client.name}. Total outstanding: ${this.formatCurrency(client.totalBalance)}`;
            
            // Scroll to results
            setTimeout(() => {
                const resultsDiv = document.querySelector('.border-t.pt-4');
                if (resultsDiv) resultsDiv.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        },
        
        viewSingleLoan(loan) {
            this.selectedLoan = loan;
            this.selectedClientLoans = [];
            this.searchMessage = `Viewing loan SN: ${loan.sn} for ${loan.names}`;
        },
        
        clearClientSearch() {
            this.clientNameSearch = '';
            this.nameSearchResults = [];
            this.selectedClientLoans = [];
            this.selectedClientName = '';
            this.selectedLoan = null;
            this.searchSN = '';
            this.searchMessage = '';
        },
        
        async downloadClientAllLoansPDF() {
    if (!this.selectedClientLoans || this.selectedClientLoans.length === 0) {
        this.showToast('No loans to download', 'error');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text(`Loan Statement for ${this.selectedClientName}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Total Outstanding: ${this.formatCurrency(this.selectedClientTotalOutstanding)}`, 14, 38);
    
    const tableData = this.selectedClientLoans.map(loan => {
        // Safely format the date
        let dateString = '';
        if (loan.date) {
            try {
                if (loan.date.toDate) {
                    // Firestore Timestamp
                    dateString = loan.date.toDate().toLocaleDateString();
                } else if (loan.date.seconds) {
                    // Firestore Timestamp alternative format
                    dateString = new Date(loan.date.seconds * 1000).toLocaleDateString();
                } else if (typeof loan.date === 'string') {
                    // String date
                    dateString = new Date(loan.date).toLocaleDateString();
                } else if (loan.date instanceof Date) {
                    // Date object
                    dateString = loan.date.toLocaleDateString();
                }
            } catch (e) {
                console.error('Date parsing error:', e);
                dateString = 'Invalid Date';
            }
        }
        
        return [
            loan.sn || '',
            dateString,
            this.formatCurrency(loan.amount || 0),
            (loan.int_rate || 0) + '%',
            this.formatCurrency(loan.amt_remitted || 0),
            this.formatCurrency(loan.balance || 0)
        ];
    });
    
    doc.autoTable({
        startY: 45,
        head: [['SN', 'Date', 'Amount', 'Rate', 'Paid', 'Balance']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] }
    });
    
    doc.save(`${this.selectedClientName.replace(/\s/g, '_')}_Loans_Statement.pdf`);
    this.showToast('PDF downloaded successfully', 'success');
},
        
        async downloadClientAllLoansCSV() {
            if (!this.selectedClientLoans || this.selectedClientLoans.length === 0) {
                this.showToast('No loans to download', 'error');
                return;
            }
            
            const headers = ['SN', 'Date', 'Amount (₦)', 'Interest Rate (%)', 'Duration (months)', 'Admin Fees (₦)', 'Paid (₦)', 'Balance (₦)'];
            
            const rows = this.selectedClientLoans.map(loan => [
                loan.sn || '',
                loan.date?.toDate().toLocaleDateString() || '',
                loan.amount || 0,
                loan.int_rate || 0,
                loan.duration || 0,
                loan.admin_fees || 0,
                loan.amt_remitted || 0,
                loan.balance || 0
            ]);
            
            const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.selectedClientName.replace(/\s/g, '_')}_Loans_Statement.csv`;
            a.click();
            URL.revokeObjectURL(url);
            this.showToast('CSV downloaded successfully', 'success');
        },
        
        formatCurrency(amount) {
            if (amount === undefined || amount === null) return '₦0.00';
            return '₦' + amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },
        
        showToast(message, type) {
            const toast = document.getElementById('toast');
            if (toast) {
                toast.textContent = message;
                toast.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg text-white ${type === 'error' ? 'bg-red-500' : 'bg-green-500'}`;
                toast.classList.remove('hidden');
                setTimeout(() => toast.classList.add('hidden'), 3000);
            }
        }

    }));
});