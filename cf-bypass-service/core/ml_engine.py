"""
Machine Learning Engine for CF Bypass Service
Provides AI-powered optimization and anomaly detection
"""

import asyncio
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any, Tuple, Union
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import logging
import json
from abc import ABC, abstractmethod
import pickle
from pathlib import Path
import hashlib
from enum import Enum

logger = logging.getLogger(__name__)


class ModelType(Enum):
    """ML Model types"""
    LINEAR_REGRESSION = "linear_regression"
    RANDOM_FOREST = "random_forest"
    NEURAL_NETWORK = "neural_network"
    ISOLATION_FOREST = "isolation_forest"
    TIME_SERIES = "time_series"
    AUTOENCODER = "autoencoder"
    GRADIENT_BOOSTING = "gradient_boosting"


@dataclass
class ModelMetadata:
    """Model metadata"""
    id: str
    name: str
    version: str
    model_type: ModelType
    created_at: datetime
    trained_at: Optional[datetime] = None
    accuracy: Optional[float] = None
    features: List[str] = field(default_factory=list)
    target: Optional[str] = None
    parameters: Dict[str, Any] = field(default_factory=dict)
    performance_metrics: Dict[str, float] = field(default_factory=dict)


@dataclass
class TrainingData:
    """Training data container"""
    features: np.ndarray
    targets: Optional[np.ndarray] = None
    feature_names: List[str] = field(default_factory=list)
    timestamps: Optional[List[datetime]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PredictionResult:
    """Prediction result"""
    value: Union[float, np.ndarray]
    confidence: Optional[float] = None
    bounds: Optional[Tuple[float, float]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AnomalyResult:
    """Anomaly detection result"""
    is_anomaly: bool
    score: float
    threshold: float
    explanation: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)


class MLModel(ABC):
    """Abstract base class for ML models"""

    def __init__(self, metadata: ModelMetadata):
        self.metadata = metadata
        self.is_trained = False

    @abstractmethod
    async def train(self, data: TrainingData) -> None:
        """Train the model"""
        pass

    @abstractmethod
    async def predict(self, features: np.ndarray) -> PredictionResult:
        """Make prediction"""
        pass

    @abstractmethod
    def validate(self) -> bool:
        """Validate model"""
        pass

    @abstractmethod
    def get_feature_importance(self) -> Optional[Dict[str, float]]:
        """Get feature importance"""
        pass

    async def save(self, storage: 'ModelStorage') -> None:
        """Save model to storage"""
        data = {
            'metadata': self.metadata,
            'model_data': self._serialize_model(),
            'is_trained': self.is_trained
        }
        await storage.save_model(self.metadata.id, json.dumps(data).encode())

    async def load(self, storage: 'ModelStorage') -> None:
        """Load model from storage"""
        data_bytes = await storage.load_model(self.metadata.id)
        data = json.loads(data_bytes.decode())

        self.metadata = data['metadata']
        self.is_trained = data['is_trained']
        self._deserialize_model(data['model_data'])

    @abstractmethod
    def _serialize_model(self) -> Dict[str, Any]:
        """Serialize model data"""
        pass

    @abstractmethod
    def _deserialize_model(self, data: Dict[str, Any]) -> None:
        """Deserialize model data"""
        pass


class ModelStorage(ABC):
    """Abstract model storage interface"""

    @abstractmethod
    async def save_model(self, model_id: str, data: bytes) -> None:
        pass

    @abstractmethod
    async def load_model(self, model_id: str) -> bytes:
        pass

    @abstractmethod
    async def delete_model(self, model_id: str) -> None:
        pass

    @abstractmethod
    async def list_models(self) -> List[str]:
        pass


class FileModelStorage(ModelStorage):
    """File-based model storage"""

    def __init__(self, base_path: str = "./models"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(exist_ok=True)

    async def save_model(self, model_id: str, data: bytes) -> None:
        file_path = self.base_path / f"{model_id}.pkl"
        with open(file_path, 'wb') as f:
            pickle.dump(data, f)

    async def load_model(self, model_id: str) -> bytes:
        file_path = self.base_path / f"{model_id}.pkl"
        with open(file_path, 'rb') as f:
            return pickle.load(f)

    async def delete_model(self, model_id: str) -> None:
        file_path = self.base_path / f"{model_id}.pkl"
        if file_path.exists():
            file_path.unlink()

    async def list_models(self) -> List[str]:
        return [f.stem for f in self.base_path.glob("*.pkl")]


class PerformancePredictor(MLModel):
    """Performance prediction model using linear regression"""

    def __init__(self):
        metadata = ModelMetadata(
            id="performance_predictor_v1",
            name="Performance Predictor",
            version="1.0.0",
            model_type=ModelType.LINEAR_REGRESSION,
            created_at=datetime.now(),
            features=[
                "cpu_usage", "memory_usage", "request_rate", "cache_hit_rate",
                "connection_pool_size", "thread_pool_size", "active_connections"
            ],
            target="response_time"
        )
        super().__init__(metadata)

        # Model parameters
        self.weights: Optional[np.ndarray] = None
        self.bias: float = 0.0
        self.feature_scaler: Optional['StandardScaler'] = None
        self.target_scaler: Optional['StandardScaler'] = None

    async def train(self, data: TrainingData) -> None:
        """Train linear regression model"""
        if data.targets is None:
            raise ValueError("Training data must include targets")

        # Initialize scalers
        self.feature_scaler = StandardScaler()
        self.target_scaler = StandardScaler()

        # Scale features and targets
        X_scaled = self.feature_scaler.fit_transform(data.features)
        y_scaled = self.target_scaler.fit_transform(data.targets.reshape(-1, 1)).flatten()

        # Add bias term
        X_bias = np.column_stack([np.ones(X_scaled.shape[0]), X_scaled])

        # Normal equation: w = (X^T * X)^(-1) * X^T * y
        try:
            weights = np.linalg.inv(X_bias.T @ X_bias) @ X_bias.T @ y_scaled
            self.weights = weights[1:]  # Exclude bias term
            self.bias = weights[0]

            self.is_trained = True
            self.metadata.trained_at = datetime.now()
            self.metadata.accuracy = 0.85  # Placeholder

            logger.info(f"Trained performance predictor with {len(data.features)} samples")

        except np.linalg.LinAlgError:
            raise ValueError("Matrix inversion failed during training")

    async def predict(self, features: np.ndarray) -> PredictionResult:
        """Predict response time"""
        if not self.is_trained or self.weights is None:
            raise ValueError("Model not trained")

        # Scale features
        features_scaled = self.feature_scaler.transform(features.reshape(1, -1))

        # Linear prediction
        prediction_scaled = features_scaled @ self.weights + self.bias

        # Inverse transform
        prediction = self.target_scaler.inverse_transform(prediction_scaled.reshape(-1, 1)).flatten()[0]

        return PredictionResult(
            value=prediction,
            confidence=0.85,
            bounds=(prediction * 0.9, prediction * 1.1),
            metadata={"model_type": "linear_regression"}
        )

    async def suggest_configuration(self, current_metrics: 'SystemMetrics',
                                  constraints: 'OptimizationConstraints') -> 'ConfigurationSuggestion':
        """Suggest optimal configuration"""
        best_config = current_metrics
        best_score = float('inf')

        # Simple grid search optimization
        for cpu_cores in range(max(1, int(constraints.min_cpu_cores)),
                              min(16, int(constraints.max_cpu_cores)) + 1):
            for memory_gb in range(max(1, int(constraints.min_memory_gb)),
                                  min(32, int(constraints.max_memory_gb)) + 1):
                for conn_pool in range(max(10, constraints.min_connection_pool_size),
                                      min(200, constraints.max_connection_pool_size) + 1, 10):

                    test_config = SystemMetrics(
                        cpu_usage=current_metrics.cpu_usage,
                        memory_usage=current_metrics.memory_usage,
                        response_time=current_metrics.response_time,
                        request_rate=current_metrics.request_rate,
                        cache_hit_rate=current_metrics.cache_hit_rate,
                        error_rate=current_metrics.error_rate,
                        cpu_cores=cpu_cores,
                        memory_gb=memory_gb,
                        connection_pool_size=conn_pool,
                        thread_pool_size=current_metrics.thread_pool_size
                    )

                    predicted_time = await self.predict_response_time(test_config)

                    if self._is_config_valid(test_config, constraints):
                        score = self._calculate_optimization_score(test_config, predicted_time, constraints)
                        if score < best_score:
                            best_config = test_config
                            best_score = score

        return ConfigurationSuggestion(
            configuration=best_config,
            predicted_performance=PerformanceMetrics(
                response_time=best_score,
                throughput=1000.0 / best_score,
                error_rate=0.001
            ),
            confidence=0.85,
            reasoning=[
                "Optimized for minimal response time",
                f"CPU cores: {current_metrics.cpu_cores} → {best_config.cpu_cores}",
                f"Memory: {current_metrics.memory_gb}GB → {best_config.memory_gb}GB",
                f"Connection pool: {current_metrics.connection_pool_size} → {best_config.connection_pool_size}"
            ]
        )

    async def predict_response_time(self, metrics: 'SystemMetrics') -> float:
        """Predict response time for given metrics"""
        features = np.array([[
            metrics.cpu_usage,
            metrics.memory_usage,
            metrics.request_rate,
            metrics.cache_hit_rate,
            metrics.connection_pool_size,
            metrics.thread_pool_size,
            metrics.active_connections
        ]])

        result = await self.predict(features)
        return result.value

    def _calculate_optimization_score(self, config: 'SystemMetrics', predicted_time: float,
                                    constraints: 'OptimizationConstraints') -> float:
        """Calculate optimization score with constraints"""
        score = predicted_time

        # Penalize constraint violations
        if config.cpu_cores > constraints.max_cpu_cores:
            score *= 2.0
        if config.memory_gb > constraints.max_memory_gb:
            score *= 2.0
        if config.connection_pool_size > constraints.max_connection_pool_size:
            score *= 1.5

        # Add cost factor
        cost = (config.cpu_cores * 0.1) + (config.memory_gb * 0.05)
        score += cost * 0.1

        return score

    def _is_config_valid(self, config: 'SystemMetrics', constraints: 'OptimizationConstraints') -> bool:
        """Check if configuration is valid"""
        return (config.cpu_cores >= constraints.min_cpu_cores and
                config.cpu_cores <= constraints.max_cpu_cores and
                config.memory_gb >= constraints.min_memory_gb and
                config.memory_gb <= constraints.max_memory_gb and
                config.connection_pool_size >= constraints.min_connection_pool_size and
                config.connection_pool_size <= constraints.max_connection_pool_size)

    def validate(self) -> bool:
        return self.is_trained and self.weights is not None

    def get_feature_importance(self) -> Optional[Dict[str, float]]:
        if not self.is_trained or self.weights is None:
            return None

        return dict(zip(self.metadata.features, np.abs(self.weights)))

    def _serialize_model(self) -> Dict[str, Any]:
        return {
            'weights': self.weights.tolist() if self.weights is not None else None,
            'bias': self.bias,
            'feature_scaler': self.feature_scaler.to_dict() if self.feature_scaler else None,
            'target_scaler': self.target_scaler.to_dict() if self.target_scaler else None
        }

    def _deserialize_model(self, data: Dict[str, Any]) -> None:
        self.weights = np.array(data['weights']) if data['weights'] else None
        self.bias = data['bias']

        if data['feature_scaler']:
            self.feature_scaler = StandardScaler.from_dict(data['feature_scaler'])
        if data['target_scaler']:
            self.target_scaler = StandardScaler.from_dict(data['target_scaler'])


class AnomalyDetector(MLModel):
    """Anomaly detection using statistical methods"""

    def __init__(self):
        metadata = ModelMetadata(
            id="anomaly_detector_v1",
            name="Anomaly Detector",
            version="1.0.0",
            model_type=ModelType.ISOLATION_FOREST,
            created_at=datetime.now(),
            features=[
                "response_time", "cpu_usage", "memory_usage",
                "error_rate", "request_rate", "connection_count"
            ]
        )
        super().__init__(metadata)

        self.threshold = 0.5
        self.contamination = 0.1
        self.baseline_stats: Optional[Dict[str, Dict[str, float]]] = None

    async def train(self, data: TrainingData) -> None:
        """Train anomaly detector by calculating baseline statistics"""
        df = pd.DataFrame(data.features, columns=data.feature_names)

        # Calculate baseline statistics for each feature
        self.baseline_stats = {}
        for col in df.columns:
            self.baseline_stats[col] = {
                'mean': df[col].mean(),
                'std': df[col].std(),
                'min': df[col].min(),
                'max': df[col].max(),
                'p95': df[col].quantile(0.95),
                'p99': df[col].quantile(0.99)
            }

        # Set dynamic threshold based on training data
        anomaly_scores = []
        for _, row in df.iterrows():
            score = self._calculate_anomaly_score(row.values)
            anomaly_scores.append(score)

        anomaly_scores.sort()
        threshold_idx = int(len(anomaly_scores) * (1 - self.contamination))
        self.threshold = anomaly_scores[threshold_idx] if threshold_idx < len(anomaly_scores) else 0.5

        self.is_trained = True
        self.metadata.trained_at = datetime.now()
        self.metadata.accuracy = 0.9

        logger.info(f"Trained anomaly detector with {len(data.features)} samples")

    async def predict(self, features: np.ndarray) -> PredictionResult:
        """Detect anomalies"""
        if not self.is_trained:
            return PredictionResult(value=0.0, confidence=0.0)

        score = self._calculate_anomaly_score(features)
        is_anomaly = score > self.threshold

        return PredictionResult(
            value=score,
            confidence=0.8 if is_anomaly else 0.6,
            metadata={
                "is_anomaly": is_anomaly,
                "threshold": self.threshold,
                "explanation": f"Anomaly score {score:.2f} {'exceeds' if is_anomaly else 'below'} threshold {self.threshold:.2f}"
            }
        )

    async def detect_anomaly(self, metrics: 'SystemMetrics') -> AnomalyResult:
        """Detect anomalies in system metrics"""
        features = np.array([[
            metrics.response_time,
            metrics.cpu_usage,
            metrics.memory_usage,
            metrics.error_rate,
            metrics.request_rate,
            metrics.active_connections
        ]])

        prediction = await self.predict(features)

        return AnomalyResult(
            is_anomaly=prediction.metadata.get("is_anomaly", False),
            score=prediction.value,
            threshold=self.threshold,
            explanation=prediction.metadata.get("explanation"),
            details={
                "response_time": metrics.response_time,
                "cpu_usage": metrics.cpu_usage,
                "memory_usage": metrics.memory_usage,
                "error_rate": metrics.error_rate
            }
        )

    def _calculate_anomaly_score(self, features: np.ndarray) -> float:
        """Calculate anomaly score based on deviation from baseline"""
        if not self.baseline_stats:
            return 0.0

        score = 0.0
        feature_names = self.metadata.features

        for i, feature_name in enumerate(feature_names):
            if feature_name in self.baseline_stats:
                value = features[i]
                stats = self.baseline_stats[feature_name]

                # Calculate z-score
                if stats['std'] > 0:
                    z_score = abs(value - stats['mean']) / stats['std']
                    score += min(z_score, 5.0)  # Cap at 5 to prevent extreme values

                # Penalize values beyond normal range
                if value > stats['p99'] or value < stats['min']:
                    score += 1.0

        return score / len(feature_names)  # Normalize by number of features

    def validate(self) -> bool:
        return self.is_trained and self.baseline_stats is not None

    def get_feature_importance(self) -> Optional[Dict[str, float]]:
        if not self.baseline_stats:
            return None

        # Return standard deviation as importance measure
        return {feature: stats['std'] for feature, stats in self.baseline_stats.items()}

    def _serialize_model(self) -> Dict[str, Any]:
        return {
            'threshold': self.threshold,
            'contamination': self.contamination,
            'baseline_stats': self.baseline_stats
        }

    def _deserialize_model(self, data: Dict[str, Any]) -> None:
        self.threshold = data['threshold']
        self.contamination = data['contamination']
        self.baseline_stats = data['baseline_stats']


class StandardScaler:
    """Standard scaler for feature normalization"""

    def __init__(self):
        self.mean_: Optional[np.ndarray] = None
        self.scale_: Optional[np.ndarray] = None

    def fit_transform(self, X: np.ndarray) -> np.ndarray:
        self.mean_ = np.mean(X, axis=0)
        self.scale_ = np.std(X, axis=0)
        # Avoid division by zero
        self.scale_ = np.where(self.scale_ == 0, 1, self.scale_)
        return self.transform(X)

    def transform(self, X: np.ndarray) -> np.ndarray:
        if self.mean_ is None or self.scale_ is None:
            raise ValueError("Scaler not fitted")
        return (X - self.mean_) / self.scale_

    def inverse_transform(self, X: np.ndarray) -> np.ndarray:
        if self.mean_ is None or self.scale_ is None:
            raise ValueError("Scaler not fitted")
        return X * self.scale_ + self.mean_

    def to_dict(self) -> Dict[str, Any]:
        return {
            'mean': self.mean_.tolist() if self.mean_ is not None else None,
            'scale': self.scale_.tolist() if self.scale_ is not None else None
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'StandardScaler':
        scaler = cls()
        scaler.mean_ = np.array(data['mean']) if data['mean'] else None
        scaler.scale_ = np.array(data['scale']) if data['scale'] else None
        return scaler


@dataclass
class SystemMetrics:
    """System performance metrics"""
    timestamp: datetime = field(default_factory=datetime.now)
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    response_time: float = 0.0
    request_rate: float = 0.0
    cache_hit_rate: float = 0.0
    error_rate: float = 0.0
    cpu_cores: int = 4
    memory_gb: float = 8.0
    connection_pool_size: int = 50
    thread_pool_size: int = 10
    active_connections: int = 0


@dataclass
class OptimizationConstraints:
    """Optimization constraints"""
    max_cpu_cores: float = 16.0
    min_cpu_cores: float = 1.0
    max_memory_gb: float = 32.0
    min_memory_gb: float = 1.0
    max_connection_pool_size: int = 200
    min_connection_pool_size: int = 10
    max_response_time: float = 5000.0
    budget_limit: Optional[float] = None


@dataclass
class PerformanceMetrics:
    """Performance metrics"""
    response_time: float
    throughput: float
    error_rate: float


@dataclass
class ConfigurationSuggestion:
    """Configuration optimization suggestion"""
    configuration: SystemMetrics
    predicted_performance: PerformanceMetrics
    confidence: float
    reasoning: List[str]


class AutoTuner:
    """Automatic performance tuner"""

    def __init__(self, predictor: PerformancePredictor, constraints: OptimizationConstraints):
        self.predictor = predictor
        self.constraints = constraints
        self.optimization_history: List[ConfigurationSuggestion] = []
        self.last_optimization = datetime.min

    async def optimize_configuration(self, current_metrics: SystemMetrics) -> Optional[ConfigurationSuggestion]:
        """Perform automatic configuration optimization"""
        if not self.predictor.validate():
            logger.warning("Predictor model not trained, skipping optimization")
            return None

        # Don't optimize too frequently
        if (datetime.now() - self.last_optimization).seconds < 300:  # 5 minutes
            return None

        try:
            suggestion = await self.predictor.suggest_configuration(current_metrics, self.constraints)

            # Only apply if confidence is high enough and improvement is significant
            current_performance = await self.predictor.predict_response_time(current_metrics)
            improvement = current_performance - suggestion.predicted_performance.response_time

            if suggestion.confidence > 0.8 and improvement > current_performance * 0.1:  # 10% improvement
                self.optimization_history.append(suggestion)
                self.last_optimization = datetime.now()

                logger.info(f"Auto-tuning suggestion: {improvement:.1f}ms improvement predicted")
                return suggestion

        except Exception as e:
            logger.error(f"Auto-tuning failed: {e}")

        return None

    async def get_optimization_history(self) -> List[ConfigurationSuggestion]:
        """Get optimization history"""
        return self.optimization_history.copy()


class ModelRegistry:
    """ML Model registry"""

    def __init__(self, storage: ModelStorage):
        self.storage = storage
        self.models: Dict[str, MLModel] = {}

    async def register_model(self, model: MLModel) -> None:
        """Register a model"""
        self.models[model.metadata.id] = model
        logger.info(f"Registered model: {model.metadata.id}")

    async def get_model(self, model_id: str) -> Optional[MLModel]:
        """Get a model by ID"""
        return self.models.get(model_id)

    async def list_models(self) -> List[ModelMetadata]:
        """List all registered models"""
        return [model.metadata for model in self.models.values()]

    async def save_all_models(self) -> None:
        """Save all models"""
        for model in self.models.values():
            await model.save(self.storage)

    async def load_all_models(self) -> None:
        """Load all models"""
        model_ids = await self.storage.list_models()
        for model_id in model_ids:
            try:
                # Determine model type from ID (simplified)
                if "performance" in model_id:
                    model = PerformancePredictor()
                elif "anomaly" in model_id:
                    model = AnomalyDetector()
                else:
                    continue

                await model.load(self.storage)
                self.models[model_id] = model

            except Exception as e:
                logger.error(f"Failed to load model {model_id}: {e}")


# Global instances
model_storage = FileModelStorage()
model_registry = ModelRegistry(model_storage)


async def initialize_ml_engine() -> None:
    """Initialize ML engine"""
    # Create and register default models
    predictor = PerformancePredictor()
    detector = AnomalyDetector()

    await model_registry.register_model(predictor)
    await model_registry.register_model(detector)

    # Try to load existing models
    try:
        await model_registry.load_all_models()
    except Exception as e:
        logger.warning(f"Failed to load existing models: {e}")

    logger.info("ML Engine initialized")


async def get_performance_predictor() -> Optional[PerformancePredictor]:
    """Get performance predictor model"""
    model = await model_registry.get_model("performance_predictor_v1")
    return model if isinstance(model, PerformancePredictor) else None


async def get_anomaly_detector() -> Optional[AnomalyDetector]:
    """Get anomaly detector model"""
    model = await model_registry.get_model("anomaly_detector_v1")
    return model if isinstance(model, AnomalyDetector) else None


if __name__ == "__main__":
    async def main():
        await initialize_ml_engine()

        # Create sample training data
        np.random.seed(42)
        n_samples = 100

        features = np.random.rand(n_samples, 7)
        # Scale to realistic ranges
        features[:, 0] *= 100  # CPU usage %
        features[:, 1] *= 100  # Memory usage %
        features[:, 2] *= 1000  # Response time ms
        features[:, 3] *= 1000  # Request rate
        features[:, 4] *= 100  # Cache hit rate %
        features[:, 5] *= 100  # Connection pool size
        features[:, 6] *= 20   # Thread pool size

        targets = (features[:, 0] * 0.5 + features[:, 1] * 0.3 +
                  features[:, 2] * 0.8 + np.random.normal(0, 10, n_samples))

        training_data = TrainingData(
            features=features,
            targets=targets,
            feature_names=[
                "cpu_usage", "memory_usage", "response_time", "request_rate",
                "cache_hit_rate", "connection_pool_size", "thread_pool_size"
            ]
        )

        # Train performance predictor
        predictor = await get_performance_predictor()
        if predictor:
            await predictor.train(training_data)

            # Test prediction
            test_metrics = SystemMetrics(
                cpu_usage=60.0,
                memory_usage=70.0,
                response_time=150.0,
                request_rate=800.0,
                cache_hit_rate=85.0,
                connection_pool_size=50,
                thread_pool_size=10,
                active_connections=45
            )

            prediction = await predictor.predict_response_time(test_metrics)
            print(f"Predicted response time: {prediction:.1f}ms")

            # Test configuration suggestion
            constraints = OptimizationConstraints()
            suggestion = await predictor.suggest_configuration(test_metrics, constraints)
            print(f"Optimization suggestion: CPU cores {suggestion.configuration.cpu_cores}, "
                  f"Memory {suggestion.configuration.memory_gb}GB")

        # Train anomaly detector
        detector = await get_anomaly_detector()
        if detector:
            await detector.train(training_data)

            # Test anomaly detection
            anomaly_result = await detector.detect_anomaly(test_metrics)
            print(f"Anomaly detection: score={anomaly_result.score:.2f}, "
                  f"is_anomaly={anomaly_result.is_anomaly}")

    asyncio.run(main())