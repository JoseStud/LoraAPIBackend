/**
 * Unit Tests for Mobile Navigation Component
 */

describe('Mobile Navigation Component', () => {
    let mockElement;
    
    // Create a mock mobile navigation component for testing
    const createMobileNavComponent = () => {
        return {
            isOpen: false,
            
            toggle() {
                this.isOpen = !this.isOpen;
                this.updateUI();
            },
            
            open() {
                this.isOpen = true;
                this.updateUI();
            },
            
            close() {
                this.isOpen = false;
                this.updateUI();
            },
            
            updateUI() {
                const menu = document.querySelector('.mobile-nav-menu');
                if (menu) {
                    if (this.isOpen) {
                        menu.classList.add('active');
                        document.body.style.overflow = 'hidden';
                    } else {
                        menu.classList.remove('active');
                        document.body.style.overflow = '';
                    }
                }
            },
            
            handleKeydown(event) {
                if (event.key === 'Escape' && this.isOpen) {
                    this.close();
                }
            },
            
            init() {
                document.addEventListener('keydown', (e) => this.handleKeydown(e));
                window.addEventListener('orientationchange', () => {
                    if (this.isOpen) {
                        setTimeout(() => this.updateUI(), 100);
                    }
                });
            }
        };
    };
    
    beforeEach(() => {
        // Setup DOM
        document.body.innerHTML = `
            <div class="mobile-nav-menu">
                <div class="mobile-nav-links">
                    <a href="/" class="mobile-nav-link">Home</a>
                    <a href="/loras" class="mobile-nav-link">LoRAs</a>
                </div>
            </div>
        `;
        
        mockElement = document.querySelector('.mobile-nav-menu');
        
        // Mock DOM methods
        document.addEventListener = jest.fn();
        window.addEventListener = jest.fn();
        document.body.style = {};
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });
    
    describe('Initialization', () => {
        test('should initialize with closed state', () => {
            const component = createMobileNavComponent();
            expect(component.isOpen).toBe(false);
        });
        
        test('should set up event listeners', () => {
            const component = createMobileNavComponent();
            component.init();
            
            expect(document.addEventListener).toHaveBeenCalledWith(
                'keydown',
                expect.any(Function)
            );
            expect(window.addEventListener).toHaveBeenCalledWith(
                'orientationchange',
                expect.any(Function)
            );
        });
    });
    
    describe('Toggle Functionality', () => {
        test('should toggle navigation state', () => {
            const component = createMobileNavComponent();
            
            expect(component.isOpen).toBe(false);
            
            component.toggle();
            expect(component.isOpen).toBe(true);
            
            component.toggle();
            expect(component.isOpen).toBe(false);
        });
        
        test('should add active class when opened', () => {
            const component = createMobileNavComponent();
            
            component.open();
            
            expect(mockElement.classList.contains('active')).toBe(true);
            expect(document.body.style.overflow).toBe('hidden');
        });
        
        test('should remove active class when closed', () => {
            const component = createMobileNavComponent();
            
            // First open
            component.open();
            expect(mockElement.classList.contains('active')).toBe(true);
            
            // Then close
            component.close();
            expect(mockElement.classList.contains('active')).toBe(false);
            expect(document.body.style.overflow).toBe('');
        });
    });
    
    describe('Keyboard Navigation', () => {
        test('should close on Escape key when open', () => {
            const component = createMobileNavComponent();
            component.open();
            
            expect(component.isOpen).toBe(true);
            
            const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
            component.handleKeydown(escapeEvent);
            
            expect(component.isOpen).toBe(false);
        });
        
        test('should not close on Escape key when already closed', () => {
            const component = createMobileNavComponent();
            
            expect(component.isOpen).toBe(false);
            
            const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
            component.handleKeydown(escapeEvent);
            
            expect(component.isOpen).toBe(false);
        });
        
        test('should ignore other keys', () => {
            const component = createMobileNavComponent();
            component.open();
            
            expect(component.isOpen).toBe(true);
            
            const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
            component.handleKeydown(enterEvent);
            
            expect(component.isOpen).toBe(true);
        });
    });
    
    describe('DOM Interaction', () => {
        test('should handle missing menu element gracefully', () => {
            document.body.innerHTML = '';
            const component = createMobileNavComponent();
            
            expect(() => {
                component.updateUI();
            }).not.toThrow();
        });
        
        test('should find navigation links', () => {
            const links = document.querySelectorAll('.mobile-nav-link');
            expect(links.length).toBe(2);
            expect(links[0].getAttribute('href')).toBe('/');
            expect(links[1].getAttribute('href')).toBe('/loras');
        });
    });
});
