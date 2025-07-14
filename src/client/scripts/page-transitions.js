// Page Transitions Manager
// Handles smooth fade transitions between pages

class PageTransitions {
    constructor() {
        this.init();
    }

    init() {
        this.createTransitionOverlay();
        this.bindNavigationEvents();
        this.addPageLoadAnimation();
    }

    // Create the simple transition overlay element
    createTransitionOverlay() {
        if (document.getElementById('page-transition-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'page-transition-overlay';
        overlay.className = 'page-transition-overlay';
        document.body.appendChild(overlay);
    }

    // Bind events to navigation elements
    bindNavigationEvents() {
        // Handle navbar navigation
        const navButtons = document.querySelectorAll('.nav-button[href], .menu-item[href]');
        navButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const href = button.getAttribute('href');
                this.navigateWithTransition(href);
            });
        });

        // Handle programmatic navigation (for success flows)
        window.navigateToPage = (href) => {
            this.navigateWithTransition(href);
        };
    }

    // Main navigation function with simple fade transition
    navigateWithTransition(href) {
        const overlay = document.getElementById('page-transition-overlay');
        const pageContent = document.querySelector('.container, .setup-container, body');

        // Start fade out
        if (pageContent) pageContent.classList.add('fade-out');
        
        // Show overlay
        overlay.classList.add('active');

        // Navigate after quick fade
        setTimeout(() => {
            window.location.href = href;
        }, 200);
    }

    // Add smooth page load animation
    addPageLoadAnimation() {
        document.addEventListener('DOMContentLoaded', () => {
            const pageContent = document.querySelector('.container, .setup-container');
            if (pageContent) {
                pageContent.classList.add('fade-in');
            }

            // Hide transition overlay if it exists
            const overlay = document.getElementById('page-transition-overlay');
            if (overlay) {
                setTimeout(() => {
                    overlay.classList.remove('active');
                }, 100);
            }
        });
    }

    // Show success animation (for setup completion)
    showSuccessAnimation(options = {}) {
        const {
            title = 'Success!',
            message = 'Operation completed successfully',
            buttonText = 'Continue',
            onContinue = () => {}
        } = options;

        // Create success overlay
        const successOverlay = document.createElement('div');
        successOverlay.className = 'setup-success-animation';
        successOverlay.innerHTML = `
            <div class="success-content">
                <div class="success-icon">
                    <i class='bx bx-check'></i>
                </div>
                <div class="success-title">${title}</div>
                <div class="success-message">${message}</div>
                <button class="success-button">${buttonText}</button>
            </div>
        `;

        document.body.appendChild(successOverlay);

        // Show animation
        setTimeout(() => {
            successOverlay.classList.add('active');
        }, 100);

        // Handle continue button
        const continueBtn = successOverlay.querySelector('.success-button');
        continueBtn.addEventListener('click', () => {
            successOverlay.classList.remove('active');
            setTimeout(() => {
                document.body.removeChild(successOverlay);
                onContinue();
            }, 300);
        });

        return successOverlay;
    }

    // Smooth scroll to top
    scrollToTop(duration = 300) {
        const start = window.pageYOffset;
        const startTime = performance.now();

        const animateScroll = (currentTime) => {
            const timeElapsed = currentTime - startTime;
            const progress = Math.min(timeElapsed / duration, 1);
            const ease = this.easeOutCubic(progress);
            
            window.scrollTo(0, start * (1 - ease));
            
            if (progress < 1) {
                requestAnimationFrame(animateScroll);
            }
        };

        requestAnimationFrame(animateScroll);
    }

    // Easing function for smooth animations
    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }
}

// Initialize page transitions when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.pageTransitions = new PageTransitions();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PageTransitions;
}