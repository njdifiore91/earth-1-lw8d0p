from typing import Dict, List, Any, Optional, Tuple, Union
import numpy as np  # v1.24.0+
from datetime import datetime, timedelta
import logging
from functools import wraps, lru_cache
from concurrent.futures import ThreadPoolExecutor

from ..models.asset import (
    Asset, MIN_DETECTION_LIMIT, MAX_DETECTION_LIMIT, VALID_ASSET_TYPES
)
from ..models.collection_plan import CollectionWindow, MIN_WINDOW_DURATION

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global constants for calculations
CONFIDENCE_WEIGHT_FACTORS: Dict[str, float] = {
    'temporal': 0.4,
    'spatial': 0.3, 
    'spectral': 0.2,
    'radiometric': 0.1
}
MIN_OVERLAP_THRESHOLD: float = 0.6
MAX_GAP_DURATION: int = 3600  # Maximum gap between windows in seconds
NUMERICAL_TOLERANCE: float = 1e-10
MAX_MATRIX_SIZE: int = 10000

def validate_numerical_inputs(func):
    """Decorator for validating numerical inputs"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        def validate_value(value):
            if isinstance(value, (int, float)):
                if np.isnan(value) or np.isinf(value):
                    raise ValueError("Input contains NaN or Inf values")
            elif isinstance(value, dict):
                for v in value.values():
                    validate_value(v)
            elif isinstance(value, (list, tuple)):
                for v in value:
                    validate_value(v)
        
        for arg in args:
            validate_value(arg)
        for value in kwargs.values():
            validate_value(value)
            
        return func(*args, **kwargs)
    return wrapper

def handle_calculation_errors(func):
    """Decorator for handling calculation errors"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            logger.error(f"Error in {func.__name__}: {str(e)}")
            raise RuntimeError(f"Calculation error: {str(e)}")
    return wrapper

@validate_numerical_inputs
@handle_calculation_errors
def calculate_confidence_score(
    parameters: Dict[str, float],
    custom_weights: Optional[Dict[str, float]] = None
) -> float:
    """
    Calculates the overall confidence score with numerical validation.
    
    Args:
        parameters: Dict of parameter scores (temporal, spatial, spectral, radiometric)
        custom_weights: Optional custom weight factors
        
    Returns:
        float: Confidence score between 0 and 1
    """
    # Validate parameters
    required_params = set(CONFIDENCE_WEIGHT_FACTORS.keys())
    if not required_params.issubset(parameters.keys()):
        raise ValueError(f"Missing required parameters: {required_params - set(parameters.keys())}")
    
    # Use default or custom weights
    weights = custom_weights if custom_weights else CONFIDENCE_WEIGHT_FACTORS
    
    # Validate weights sum to 1
    if not np.isclose(sum(weights.values()), 1.0, rtol=NUMERICAL_TOLERANCE):
        raise ValueError("Weight factors must sum to 1.0")
    
    # Clip parameter values to [0,1]
    clipped_params = {k: np.clip(v, 0, 1) for k, v in parameters.items()}
    
    # Calculate weighted score with numerical stability
    score = sum(weights[k] * clipped_params[k] for k in required_params)
    
    # Apply numerical tolerance and final bounds check
    score = np.clip(score, 0, 1)
    if np.isclose(score, 0, rtol=NUMERICAL_TOLERANCE):
        score = 0.0
    elif np.isclose(score, 1, rtol=NUMERICAL_TOLERANCE):
        score = 1.0
        
    return float(score)

@lru_cache(maxsize=1024)
def interpolate_detection_limits(
    base_limit: float,
    distance: float,
    asset_type: str
) -> float:
    """
    Calculates interpolated detection limits with validation.
    
    Args:
        base_limit: Base detection limit value
        distance: Distance from target in meters
        asset_type: Type of asset being analyzed
        
    Returns:
        float: Interpolated detection limit
    """
    if asset_type not in VALID_ASSET_TYPES:
        raise ValueError(f"Invalid asset type: {asset_type}")
        
    if not MIN_DETECTION_LIMIT <= base_limit <= MAX_DETECTION_LIMIT:
        raise ValueError(f"Base limit must be between {MIN_DETECTION_LIMIT} and {MAX_DETECTION_LIMIT}")
        
    # Apply distance-based interpolation with type-specific factors
    type_factors = {
        'ENVIRONMENTAL_MONITORING': 1.2,
        'INFRASTRUCTURE': 1.0,
        'AGRICULTURE': 1.1,
        'CUSTOM': 1.3
    }
    
    factor = type_factors[asset_type]
    interpolated = base_limit * (1 + (distance / 1000) * factor)
    
    return np.clip(interpolated, MIN_DETECTION_LIMIT, MAX_DETECTION_LIMIT)

@validate_numerical_inputs
def calculate_capability_matrix(
    requirements: List[Dict[str, Any]],
    asset_capabilities: Dict[str, Any]
) -> Tuple[np.ndarray, float]:
    """
    Generates capability assessment matrix with validation.
    
    Args:
        requirements: List of requirement specifications
        asset_capabilities: Dictionary of asset capabilities
        
    Returns:
        Tuple[np.ndarray, float]: Capability matrix and overall score
    """
    if len(requirements) * len(asset_capabilities) > MAX_MATRIX_SIZE:
        raise ValueError(f"Matrix size exceeds maximum of {MAX_MATRIX_SIZE}")
        
    # Initialize capability matrix
    matrix = np.zeros((len(requirements), len(asset_capabilities)))
    
    # Calculate capability scores
    for i, req in enumerate(requirements):
        for j, (cap_name, cap_value) in enumerate(asset_capabilities.items()):
            if cap_name in req:
                matrix[i, j] = min(req[cap_name] / cap_value, 1.0)
                
    # Calculate overall score with stability checks
    if matrix.size > 0:
        overall_score = float(np.mean(matrix))
    else:
        overall_score = 0.0
        
    return matrix, overall_score

@validate_numerical_inputs
def optimize_time_windows(
    candidate_times: List[datetime],
    constraints: Dict[str, Any],
    max_windows: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Optimizes collection time windows with parallel processing.
    
    Args:
        candidate_times: List of candidate collection times
        constraints: Dictionary of optimization constraints
        max_windows: Optional maximum number of windows
        
    Returns:
        List[Dict[str, Any]]: Optimized time windows with parameters
    """
    if not candidate_times:
        return []
        
    # Sort times and validate minimum duration
    sorted_times = sorted(candidate_times)
    if (sorted_times[-1] - sorted_times[0]).total_seconds() < MIN_WINDOW_DURATION:
        raise ValueError(f"Time span must be at least {MIN_WINDOW_DURATION} seconds")
    
    def process_window(start_idx: int) -> Optional[Dict[str, Any]]:
        """Process single window starting at given index"""
        start_time = sorted_times[start_idx]
        end_idx = start_idx + 1
        
        while (end_idx < len(sorted_times) and 
               (sorted_times[end_idx] - start_time).total_seconds() <= constraints.get('max_duration', float('inf'))):
            end_idx += 1
            
        if end_idx - start_idx < 2:
            return None
            
        window = {
            'start_time': start_time,
            'end_time': sorted_times[end_idx - 1],
            'duration': (sorted_times[end_idx - 1] - start_time).total_seconds(),
            'sample_count': end_idx - start_idx
        }
        
        # Calculate confidence score for window
        params = {
            'temporal': min(window['duration'] / constraints.get('optimal_duration', window['duration']), 1.0),
            'spatial': 1.0,  # Default to 1.0, update based on specific requirements
            'spectral': 1.0,
            'radiometric': 1.0
        }
        window['confidence_score'] = calculate_confidence_score(params)
        
        return window
    
    # Process windows in parallel
    with ThreadPoolExecutor() as executor:
        windows = list(filter(None, executor.map(process_window, range(len(sorted_times)))))
    
    # Sort by confidence score and apply max_windows limit
    windows.sort(key=lambda x: x['confidence_score'], reverse=True)
    if max_windows:
        windows = windows[:max_windows]
    
    return windows

def merge_overlapping_windows(windows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Merges overlapping time windows with optimization.
    
    Args:
        windows: List of time windows to merge
        
    Returns:
        List[Dict[str, Any]]: Merged time windows
    """
    if not windows:
        return []
        
    # Sort windows by start time
    sorted_windows = sorted(windows, key=lambda x: x['start_time'])
    merged = []
    current = sorted_windows[0]
    
    for next_window in sorted_windows[1:]:
        if (next_window['start_time'] - current['end_time']).total_seconds() <= MAX_GAP_DURATION:
            # Merge windows
            current['end_time'] = max(current['end_time'], next_window['end_time'])
            current['duration'] = (current['end_time'] - current['start_time']).total_seconds()
            current['confidence_score'] = max(current['confidence_score'], next_window['confidence_score'])
        else:
            merged.append(current)
            current = next_window
            
    merged.append(current)
    return merged