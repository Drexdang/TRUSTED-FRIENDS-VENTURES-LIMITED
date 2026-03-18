document.addEventListener('alpine:init', () => {
    Alpine.data('dashboard', () => ({
        loans: [],
        charts: {},
        isLoading: true,
        renderAttempts: 0,
        maxRetries: 10,
        isRendering: false, // flag to prevent concurrent renders

        async init() {
            console.log('Dashboard init started');
            await this.loadLoans();

            // Real-time listener
            db.collection('loans').onSnapshot(snapshot => {
                console.log('Real-time update received');
                this.loans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.safeRenderCharts();
            });
        },

        async loadLoans() {
            console.log('Loading loans from Firestore');
            const snapshot = await db.collection('loans').get();
            this.loans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.isLoading = false;
            console.log(`Loaded ${this.loans.length} loans`);
            this.safeRenderCharts();
        },

        safeRenderCharts() {
            this.$nextTick(() => {
                console.log('Calling renderCharts after nextTick');
                this.renderCharts();
            });
        },

        get totalPrincipal() {
            return this.loans.reduce((sum, l) => sum + (l.amount || 0), 0);
        },
        get totalBalance() {
            return this.loans.reduce((sum, l) => sum + (l.balance || 0), 0);
        },
        get totalInterest() {
            return this.loans.reduce((sum, l) => sum + (l.interest || 0), 0);
        },
        get totalPaid() {
            return this.loans.reduce((sum, l) => sum + (l.amt_remitted || 0), 0);
        },
        get principalPercent() {
            return this.totalPrincipal ? (this.totalBalance / this.totalPrincipal * 100).toFixed(1) : 0;
        },

        groupByMonth() {
            const groups = {};
            this.loans.forEach(loan => {
                if (!loan.date) return;
                const date = loan.date.toDate ? loan.date.toDate() : new Date(loan.date);
                const month = date.toLocaleString('default', { year: 'numeric', month: 'short' });
                if (!groups[month]) groups[month] = { balance: 0, principal: 0 };
                groups[month].balance += loan.balance || 0;
                groups[month].principal += loan.amount || 0;
            });
            return Object.entries(groups)
                .map(([month, vals]) => ({ month, ...vals }))
                .sort((a, b) => new Date(a.month) - new Date(b.month));
        },

        async renderCharts() {
            // Prevent concurrent renders
            if (this.isRendering) {
                console.log('Already rendering, skipping');
                return;
            }
            this.isRendering = true;

            console.log('renderCharts called, attempt:', this.renderAttempts + 1);

            // Destroy existing charts (with a small delay to ensure cleanup)
            if (this.charts.balance) {
                this.charts.balance.destroy();
                this.charts.balance = null;
            }
            if (this.charts.topClients) {
                this.charts.topClients.destroy();
                this.charts.topClients = null;
            }
            if (this.charts.pie) {
                this.charts.pie.destroy();
                this.charts.pie = null;
            }

            // Wait a tiny moment for cleanup
            await new Promise(resolve => setTimeout(resolve, 50));

            // Get canvas elements
            const canvas1 = document.getElementById('balanceChart');
            const canvas2 = document.getElementById('topClientsChart');
            const canvas3 = document.getElementById('balancePieChart');

            console.log('Canvas elements found:', { canvas1: !!canvas1, canvas2: !!canvas2, canvas3: !!canvas3 });

            if (!canvas1 || !canvas2 || !canvas3) {
                if (this.renderAttempts < this.maxRetries) {
                    this.renderAttempts++;
                    console.log(`Canvas not ready, retry ${this.renderAttempts}/${this.maxRetries}`);
                    this.isRendering = false;
                    setTimeout(() => this.renderCharts(), 300);
                } else {
                    console.error('Canvas elements still not found after retries');
                    this.isRendering = false;
                }
                return;
            }

            // Check canvas contexts
            const ctx1 = canvas1.getContext('2d');
            const ctx2 = canvas2.getContext('2d');
            const ctx3 = canvas3.getContext('2d');

            if (!ctx1 || !ctx2 || !ctx3) {
                console.error('Canvas context not available, retrying...');
                this.isRendering = false;
                setTimeout(() => this.renderCharts(), 200);
                return;
            }

            this.renderAttempts = 0; // reset on success

            // Check if Chart.js is loaded
            if (typeof Chart === 'undefined') {
                console.error('Chart.js not loaded! Check network tab.');
                this.isRendering = false;
                return;
            }

            // Check if we have data
            if (this.loans.length === 0) {
                console.log('No loan data to display');
                // Write a message on each canvas container
                canvas1.parentElement.innerHTML += '<p class="text-gray-500">No loan data available</p>';
                this.isRendering = false;
                return;
            }

            console.log('Proceeding to create charts');

            try {
                // Balance trend chart
                const monthly = this.groupByMonth();
                if (monthly.length > 0) {
                    console.log('Creating balance trend chart');
                    this.charts.balance = new Chart(canvas1, {
                        type: 'line',
                        data: {
                            labels: monthly.map(d => d.month),
                            datasets: [
                                { 
                                    label: 'Outstanding Balance', 
                                    data: monthly.map(d => d.balance), 
                                    borderColor: '#e74c3c', 
                                    backgroundColor: 'rgba(231, 76, 60, 0.1)', 
                                    tension: 0.3, 
                                    fill: true 
                                },
                                { 
                                    label: 'Principal Disbursed', 
                                    data: monthly.map(d => d.principal), 
                                    borderColor: '#27ae60', 
                                    borderDash: [5,5], 
                                    fill: false 
                                }
                            ]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { 
                                tooltip: { 
                                    callbacks: { 
                                        label: (ctx) => formatCurrency(ctx.raw) 
                                    } 
                                }
                            }
                        }
                    });
                }

                // Top clients bar chart
                const top = [...this.loans].sort((a,b) => (b.balance||0) - (a.balance||0)).slice(0, 10);
                if (top.length > 0) {
                    console.log('Creating top clients chart');
                    this.charts.topClients = new Chart(canvas2, {
                        type: 'bar',
                        data: {
                            labels: top.map(l => l.names),
                            datasets: [{ 
                                label: 'Balance', 
                                data: top.map(l => l.balance), 
                                backgroundColor: '#3498db' 
                            }]
                        },
                        options: {
                            indexAxis: 'y',
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { 
                                tooltip: { 
                                    callbacks: { 
                                        label: (ctx) => formatCurrency(ctx.raw) 
                                    } 
                                }
                            }
                        }
                    });
                }

                // Pie chart
                const withBalance = this.loans.filter(l => l.balance > 0).slice(0, 8);
                if (withBalance.length > 0) {
                    console.log('Creating pie chart');
                    const othersBalance = this.loans.filter(l => l.balance > 0).slice(8).reduce((sum, l) => sum + l.balance, 0);
                    const pieData = withBalance.map(l => ({ name: l.names, value: l.balance }));
                    if (othersBalance > 0) pieData.push({ name: 'Others', value: othersBalance });
                    this.charts.pie = new Chart(canvas3, {
                        type: 'pie',
                        data: {
                            labels: pieData.map(d => d.name),
                            datasets: [{ 
                                data: pieData.map(d => d.value), 
                                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'] 
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { 
                                tooltip: { 
                                    callbacks: { 
                                        label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}` 
                                    } 
                                }
                            }
                        }
                    });
                }
            } catch (error) {
                console.error('Chart creation error:', error);
            }

            this.isRendering = false;
        }
    }));
});