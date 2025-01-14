// External imports with version specifications
import React from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.1.0
import { styled } from '@mui/material/styles'; // v5.13.0
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions,
  IconButton
} from '@mui/material'; // v5.13.0
import { Close as CloseIcon } from '@mui/icons-material'; // v5.13.0

// Internal imports
import { ThemeMode } from '../../../types/global';
import { setActiveModal } from '../../../store/slices/uiSlice';

// Styled components with theme-aware styling
const StyledDialog = styled(Dialog)(({ theme }) => ({
  '& .MuiBackdrop-root': {
    backdropFilter: 'blur(4px)',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    transition: 'backdrop-filter 0.3s ease'
  },
  '& .MuiDialog-paper': {
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[8],
    margin: theme.spacing(2),
    [theme.breakpoints.down('sm')]: {
      margin: theme.spacing(1),
      width: `calc(100% - ${theme.spacing(2)})`,
      maxHeight: `calc(100% - ${theme.spacing(2)})`
    }
  }
}));

const StyledDialogTitle = styled(DialogTitle)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: theme.spacing(2, 3),
  borderBottom: `1px solid ${theme.palette.divider}`,
  '& .MuiTypography-root': {
    fontWeight: theme.typography.fontWeightMedium
  }
}));

const StyledDialogContent = styled(DialogContent)(({ theme }) => ({
  padding: theme.spacing(3),
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(2)
  }
}));

const StyledDialogActions = styled(DialogActions)(({ theme }) => ({
  padding: theme.spacing(2, 3),
  borderTop: `1px solid ${theme.palette.divider}`
}));

const CloseButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  right: theme.spacing(1),
  top: theme.spacing(1),
  color: theme.palette.grey[500]
}));

// Interface for component props
interface ModalProps {
  id: string;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
  onClose?: () => void;
}

/**
 * Modal component implementing Material Design 3.0 dialog with accessibility support
 */
const Modal: React.FC<ModalProps> = React.memo(({
  id,
  title,
  children,
  maxWidth = 'sm',
  fullWidth = false,
  onClose
}) => {
  const dispatch = useDispatch();
  const activeModal = useSelector(state => state.ui.activeModal);
  const themeMode = useSelector(state => state.ui.theme);

  // Handle modal close with cleanup
  const handleClose = React.useCallback(() => {
    if (onClose) {
      onClose();
    }
    dispatch(setActiveModal(null));
  }, [dispatch, onClose]);

  // Handle escape key press
  React.useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activeModal === id) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [activeModal, id, handleClose]);

  // Focus trap management
  const dialogRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (activeModal === id && dialogRef.current) {
      const focusableElements = dialogRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length) {
        (focusableElements[0] as HTMLElement).focus();
      }
    }
  }, [activeModal, id]);

  return (
    <StyledDialog
      ref={dialogRef}
      open={activeModal === id}
      onClose={handleClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      aria-labelledby={`modal-${id}-title`}
      aria-describedby={`modal-${id}-description`}
      TransitionProps={{
        role: 'dialog',
        'aria-modal': true
      }}
    >
      <StyledDialogTitle id={`modal-${id}-title`}>
        {title}
        <CloseButton
          aria-label="Close modal"
          onClick={handleClose}
          size="large"
          edge="end"
        >
          <CloseIcon />
        </CloseButton>
      </StyledDialogTitle>
      
      <StyledDialogContent id={`modal-${id}-description`}>
        {children}
      </StyledDialogContent>
    </StyledDialog>
  );
});

Modal.displayName = 'Modal';

export default Modal;