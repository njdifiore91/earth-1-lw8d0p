import React, { useCallback, KeyboardEvent } from 'react';
import styled, { css, keyframes } from 'styled-components';
import classnames from 'classnames';

// @version styled-components@5.3.6
// @version react@18.2.0
// @version classnames@2.3.2

// Interfaces
interface LegendItem {
  label: string;
  color: string;
  active?: boolean;
  id?: string;
}

interface LegendProps {
  items: LegendItem[];
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  onItemClick?: (item: LegendItem) => void;
  ariaLabel?: string;
}

// Animations
const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

const pulse = keyframes`
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
`;

// Styled Components
const StyledLegend = styled.ul<{ orientation: 'horizontal' | 'vertical' }>`
  display: flex;
  flex-direction: ${({ orientation }) => orientation === 'horizontal' ? 'row' : 'column'};
  flex-wrap: ${({ orientation }) => orientation === 'horizontal' ? 'wrap' : 'nowrap'};
  gap: 1rem;
  padding: 0;
  margin: 0;
  list-style: none;
  animation: ${fadeIn} 300ms ease-in-out;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const StyledLegendItem = styled.li<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  cursor: pointer;
  border-radius: 4px;
  transition: all 200ms ease-in-out;
  opacity: ${({ active }) => active ? 1 : 0.5};
  
  &:hover {
    animation: ${pulse} 200ms ease-in-out;
    background-color: ${({ theme }) => theme.colors?.hover || 'rgba(0, 0, 0, 0.05)'};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors?.primary || '#0066cc'};
    outline-offset: 2px;
  }
`;

const ColorIndicator = styled.span<{ color: string }>`
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background-color: ${({ color }) => color};
  flex-shrink: 0;
`;

const Label = styled.span`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors?.text || '#333333'};
  user-select: none;
`;

// Legend Item Component
const LegendItem: React.FC<{
  item: LegendItem;
  onItemClick?: (item: LegendItem) => void;
  tabIndex: number;
}> = React.memo(({ item, onItemClick, tabIndex }) => {
  const handleClick = useCallback(() => {
    onItemClick?.(item);
  }, [item, onItemClick]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onItemClick?.(item);
    }
  }, [item, onItemClick]);

  return (
    <StyledLegendItem
      active={item.active !== false}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="listitem"
      aria-selected={item.active !== false}
      tabIndex={tabIndex}
      data-testid={`legend-item-${item.id || item.label}`}
    >
      <ColorIndicator 
        color={item.color}
        role="presentation"
        aria-hidden="true"
      />
      <Label>{item.label}</Label>
    </StyledLegendItem>
  );
});

LegendItem.displayName = 'LegendItem';

// Main Legend Component
export const Legend: React.FC<LegendProps> = React.memo(({
  items,
  orientation = 'horizontal',
  className,
  onItemClick,
  ariaLabel = 'Chart legend'
}) => {
  const handleKeyNavigation = useCallback((e: KeyboardEvent) => {
    const currentIndex = (e.target as HTMLElement).tabIndex;
    let nextIndex: number;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = Math.min(currentIndex + 1, items.length - 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      default:
        return;
    }

    e.preventDefault();
    const nextElement = document.querySelector(`[tabindex="${nextIndex}"]`) as HTMLElement;
    nextElement?.focus();
  }, [items.length]);

  return (
    <StyledLegend
      orientation={orientation}
      className={classnames('legend', orientation, className)}
      role="list"
      aria-label={ariaLabel}
      onKeyDown={handleKeyNavigation}
    >
      {items.map((item, index) => (
        <LegendItem
          key={item.id || item.label}
          item={item}
          onItemClick={onItemClick}
          tabIndex={index}
        />
      ))}
    </StyledLegend>
  );
});

Legend.displayName = 'Legend';

export default Legend;