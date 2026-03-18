document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        user: null,
        isAdmin: false,
        page: 'dashboard',
        loginEmail: '',
        loginPassword: '',
        init() {
            this.user = auth.currentUser;
            if (this.user) {
                this.checkAdmin();
            }
            window.addEventListener('auth-changed', (e) => {
                this.user = e.detail.user;
                this.isAdmin = e.detail.isAdmin;
            });
        },
        async checkAdmin() {
            if (this.user) {
                this.isAdmin = await isAdmin(this.user);
            }
        },
        async login() {
            await login(this.loginEmail, this.loginPassword);
        },
        logout() {
            logout();
        }
    }));
});