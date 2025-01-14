import React, { useMemo } from 'react';
import { Box, Container, Typography, Link } from '@mui/material'; // @version 5.x
import { styled } from '@mui/material/styles'; // @version 5.x
import { useTheme } from '../../config/theme.config';

// Interface for Footer component props
export interface FooterProps {
  className?: string;
  ariaLabel?: string;
}

// Styled footer container with theme integration
const FooterContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3, 0),
  backgroundColor: theme.palette.background.paper,
  borderTop: '1px solid',
  borderColor: theme.palette.divider,
  transition: 'all 0.2s ease-in-out',
  '@media (max-width: 600px)': {
    padding: theme.spacing(2, 0),
  },
}));

// Styled content container with responsive grid layout
const FooterContent = styled(Container)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: {
    xs: '1fr',
    sm: 'repeat(2, 1fr)',
    md: 'repeat(3, 1fr)',
  },
  gap: theme.spacing(2),
  alignItems: 'center',
  justifyContent: 'space-between',
  textAlign: {
    xs: 'center',
    sm: 'left',
  },
}));

// Navigation links with ARIA labels
const FOOTER_LINKS = [
  {
    label: 'Privacy Policy',
    href: '/privacy',
    ariaLabel: 'View Privacy Policy',
  },
  {
    label: 'Terms of Service',
    href: '/terms',
    ariaLabel: 'View Terms of Service',
  },
  {
    label: 'Contact',
    href: '/contact',
    ariaLabel: 'Contact Us',
  },
] as const;

// Get current year for copyright text
const getCurrentYear = (): number => {
  return new Date().getFullYear();
};

/**
 * Footer component implementing Material Design 3.0 specifications
 * with responsive layout and accessibility features
 */
export const Footer: React.FC<FooterProps> = ({
  className,
  ariaLabel = 'Footer',
}) => {
  const theme = useTheme();
  const currentYear = useMemo(() => getCurrentYear(), []);

  return (
    <FooterContainer
      component="footer"
      className={className}
      aria-label={ariaLabel}
    >
      <FooterContent maxWidth="lg">
        {/* Copyright text */}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            gridColumn: {
              xs: '1',
              sm: '1',
              md: '1',
            },
          }}
        >
          © {currentYear} Matter. All rights reserved.
        </Typography>

        {/* Navigation links */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: {
              xs: 'column',
              sm: 'row',
            },
            gap: theme.spacing(2),
            justifyContent: {
              xs: 'center',
              sm: 'flex-end',
            },
            gridColumn: {
              xs: '1',
              sm: '2',
              md: '2 / span 2',
            },
          }}
        >
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              color="text.secondary"
              underline="hover"
              aria-label={link.ariaLabel}
              sx={{
                typography: 'body2',
                transition: 'color 0.2s ease-in-out',
                '&:hover': {
                  color: theme.palette.text.primary,
                },
                '&:focus-visible': {
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: '2px',
                },
              }}
            >
              {link.label}
            </Link>
          ))}
        </Box>
      </FooterContent>
    </FooterContainer>
  );
};

export default Footer;