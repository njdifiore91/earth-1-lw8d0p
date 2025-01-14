import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react'; // @version 14.x
import userEvent from '@testing-library/user-event'; // @version 14.x
import { ThemeProvider } from '@mui/material/styles'; // @version 5.x
import Footer, { FooterProps } from './Footer';
import { defaultTheme } from '../../config/theme.config';

// Test IDs for component selection
const TEST_IDS = {
  FOOTER: 'footer',
  COPYRIGHT: 'footer-copyright',
  NAVIGATION: 'footer-nav',
  SOCIAL_LINKS: 'footer-social'
} as const;

// Viewport size constants
const VIEWPORT_SIZES = {
  DESKTOP: '1200',
  TABLET: '768',
  MOBILE: '576'
} as const;

// Helper function to render component with theme
const renderWithTheme = (component: React.ReactElement, themeOverrides = {}) => {
  const theme = { ...defaultTheme, ...themeOverrides };
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

// Helper function to simulate viewport size
const setViewportSize = (width: string, height = '800') => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: parseInt(width)
  });
  
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: parseInt(height)
  });
  
  window.dispatchEvent(new Event('resize'));
};

// Mock current year for consistent testing
const mockCurrentYear = '2024';
jest.mock('./Footer', () => ({
  ...jest.requireActual('./Footer'),
  getCurrentYear: () => mockCurrentYear
}));

describe('Footer Component', () => {
  beforeEach(() => {
    // Mock matchMedia for responsive testing
    window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }));
  });

  it('renders copyright text correctly', () => {
    renderWithTheme(<Footer />);
    
    const copyrightText = screen.getByText(new RegExp(`© ${mockCurrentYear} Matter`));
    expect(copyrightText).toBeInTheDocument();
    expect(copyrightText).toHaveStyle({
      color: defaultTheme.palette.text.secondary
    });
  });

  it('applies theme styles correctly', () => {
    renderWithTheme(<Footer />);
    
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveStyle({
      backgroundColor: defaultTheme.palette.background.paper,
      borderColor: defaultTheme.palette.divider
    });
  });

  it('renders all navigation links with correct attributes', () => {
    renderWithTheme(<Footer />);
    
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3); // Privacy, Terms, Contact

    const expectedLinks = [
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/terms', label: 'Terms of Service' },
      { href: '/contact', label: 'Contact' }
    ];

    links.forEach((link, index) => {
      expect(link).toHaveAttribute('href', expectedLinks[index].href);
      expect(link).toHaveTextContent(expectedLinks[index].label);
      expect(link).toHaveAttribute('aria-label');
    });
  });

  describe('Responsive Layout', () => {
    it('adapts to desktop layout', () => {
      setViewportSize(VIEWPORT_SIZES.DESKTOP);
      renderWithTheme(<Footer />);
      
      const footer = screen.getByRole('contentinfo');
      expect(footer).toHaveStyle({
        padding: `${defaultTheme.spacing(3)}px 0`
      });
      
      const container = within(footer).getByRole('contentinfo');
      expect(container).toHaveStyle({
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)'
      });
    });

    it('adapts to tablet layout', () => {
      setViewportSize(VIEWPORT_SIZES.TABLET);
      renderWithTheme(<Footer />);
      
      const footer = screen.getByRole('contentinfo');
      const container = within(footer).getByRole('contentinfo');
      expect(container).toHaveStyle({
        gridTemplateColumns: 'repeat(2, 1fr)'
      });
    });

    it('adapts to mobile layout', () => {
      setViewportSize(VIEWPORT_SIZES.MOBILE);
      renderWithTheme(<Footer />);
      
      const footer = screen.getByRole('contentinfo');
      expect(footer).toHaveStyle({
        padding: `${defaultTheme.spacing(2)}px 0`
      });
      
      const container = within(footer).getByRole('contentinfo');
      expect(container).toHaveStyle({
        gridTemplateColumns: '1fr',
        textAlign: 'center'
      });
    });
  });

  describe('Accessibility', () => {
    it('has correct ARIA attributes', () => {
      renderWithTheme(<Footer ariaLabel="Custom footer label" />);
      
      const footer = screen.getByRole('contentinfo');
      expect(footer).toHaveAttribute('aria-label', 'Custom footer label');
    });

    it('supports keyboard navigation', async () => {
      renderWithTheme(<Footer />);
      
      const links = screen.getAllByRole('link');
      const firstLink = links[0];
      
      firstLink.focus();
      expect(document.activeElement).toBe(firstLink);
      
      await userEvent.keyboard('{Tab}');
      expect(document.activeElement).toBe(links[1]);
      
      await userEvent.keyboard('{Tab}');
      expect(document.activeElement).toBe(links[2]);
    });

    it('has sufficient color contrast', () => {
      renderWithTheme(<Footer />);
      
      const links = screen.getAllByRole('link');
      links.forEach(link => {
        const styles = window.getComputedStyle(link);
        expect(styles.color).toBe(defaultTheme.palette.text.secondary);
      });
    });

    it('maintains focus visibility', async () => {
      renderWithTheme(<Footer />);
      
      const links = screen.getAllByRole('link');
      const firstLink = links[0];
      
      await userEvent.tab();
      expect(document.activeElement).toBe(firstLink);
      expect(firstLink).toHaveStyle({
        outline: `2px solid ${defaultTheme.palette.primary.main}`
      });
    });
  });
});