document.addEventListener('alpine:init', () => {
    Alpine.data('reminders', () => ({
        overdueLoans: [],
        showReminders: false,
        init() {
            this.loadOverdue();
            db.collection('loans').onSnapshot(() => this.loadOverdue());
        },
        async loadOverdue() {
            const snapshot = await db.collection('loans').get();
            const loans = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const today = new Date();
            this.overdueLoans = loans.filter(loan => {
                if (loan.balance <= 0) return false;
                const dueDate = new Date(loan.date.seconds * 1000);
                dueDate.setMonth(dueDate.getMonth() + (loan.duration || 0));
                return today > dueDate;
            }).sort((a, b) => {
                const dateA = new Date(a.date.seconds * 1000);
                const dateB = new Date(b.date.seconds * 1000);
                return dateA - dateB;
            });
        },
        daysOverdue(dueDate) {
            const today = new Date();
            const diff = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
            return diff > 0 ? diff : 0;
        },
        formatDate(timestamp) {
            return timestamp ? new Date(timestamp.seconds * 1000).toLocaleDateString() : '';
        }
    }));
});