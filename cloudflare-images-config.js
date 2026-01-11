// Cloudflare Images Configuration for Nexus Reader
// Automatic image optimization and transformation service

const IMAGES_CONFIG = {
  // Image optimization settings
  optimization: {
    // Quality settings for different image types
    quality: {
      jpeg: 85,      // High quality for photos
      webp: 80,      // Slightly lower for better compression
      avif: 75,      // Even better compression with AVIF
      png: 90       // High quality for graphics with transparency
    },
    
    // Format preferences (in order of preference)
    formatPreference: ['avif', 'webp', 'jpeg', 'png'],
    
    // Compression settings
    compression: {
      lossless: false,     // Use lossy compression for better file sizes
      progressive: true,   // Progressive JPEG loading
      stripMetadata: true, // Remove EXIF data for privacy and size
      optimizeTransparency: true
    },
    
    // Auto-optimization features
    autoOptimization: {
      enabled: true,
      smartCrop: true,     // Intelligent cropping based on content
      faceDetection: true, // Preserve faces when cropping
      objectDetection: true // Preserve important objects
    }
  },

  // Responsive image variants
  variants: {
    // Thumbnail sizes for novel covers
    thumbnail: {
      width: 150,
      height: 200,
      fit: 'cover',
      quality: 80,
      format: 'auto'
    },
    
    // Small covers for lists
    small: {
      width: 300,
      height: 400,
      fit: 'cover',
      quality: 85,
      format: 'auto'
    },
    
    // Medium covers for detail views
    medium: {
      width: 600,
      height: 800,
      fit: 'cover',
      quality: 90,
      format: 'auto'
    },
    
    // Large covers for full-screen viewing
    large: {
      width: 1200,
      height: 1600,
      fit: 'cover',
      quality: 95,
      format: 'auto'
    },
    
    // Avatar sizes for user profiles
    avatar_small: {
      width: 32,
      height: 32,
      fit: 'cover',
      quality: 80,
      format: 'auto'
    },
    
    avatar_medium: {
      width: 64,
      height: 64,
      fit: 'cover',
      quality: 85,
      format: 'auto'
    },
    
    avatar_large: {
      width: 128,
      height: 128,
      fit: 'cover',
      quality: 90,
      format: 'auto'
    },
    
    // Banner images
    banner: {
      width: 1920,
      height: 480,
      fit: 'cover',
      quality: 85,
      format: 'auto'
    },
    
    // Mobile-optimized versions
    mobile_small: {
      width: 200,
      height: 267,
      fit: 'cover',
      quality: 75,
      format: 'auto',
      dpr: 2 // 2x pixel density for retina displays
    },
    
    mobile_medium: {
      width: 400,
      height: 533,
      fit: 'cover',
      quality: 80,
      format: 'auto',
      dpr: 2
    }
  },

  // Device-specific optimizations
  deviceOptimization: {
    // Desktop browsers
    desktop: {
      preferredFormats: ['avif', 'webp', 'jpeg'],
      maxWidth: 1920,
      quality: 90,
      enableProgressive: true
    },
    
    // Mobile devices
    mobile: {
      preferredFormats: ['avif', 'webp', 'jpeg'],
      maxWidth: 800,
      quality: 80,
      enableProgressive: false, // Faster initial load
      aggressiveCompression: true
    },
    
    // Tablet devices
    tablet: {
      preferredFormats: ['avif', 'webp', 'jpeg'],
      maxWidth: 1200,
      quality: 85,
      enableProgressive: true
    }
  },

  // Caching configuration
  caching: {
    // Browser cache duration
    browserCache: {
      original: 31536000,    // 1 year for original images
      variants: 31536000,    // 1 year for variants
      transformed: 2592000   // 30 days for on-demand transforms
    },
    
    // CDN cache duration
    cdnCache: {
      original: 31536000,    // 1 year
      variants: 31536000,    // 1 year
      transformed: 2592000   // 30 days
    },
    
    // Cache headers
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Vary': 'Accept, User-Agent',
      'X-Content-Type-Options': 'nosniff'
    }
  },

  // URL patterns and routing
  urlPatterns: {
    // Direct image serving
    direct: '/images/{imageId}/{variant?}',
    
    // Resizing on-the-fly
    resize: '/images/resize/{width}x{height}/{imageId}',
    
    // Format conversion
    convert: '/images/convert/{format}/{imageId}',
    
    // Smart crop
    crop: '/images/crop/{width}x{height}/{gravity}/{imageId}',
    
    // Watermark overlay
    watermark: '/images/watermark/{imageId}',
    
    // Blur for NSFW content
    blur: '/images/blur/{strength}/{imageId}'
  },

  // Upload and processing settings
  upload: {
    // Allowed formats
    allowedFormats: ['jpeg', 'jpg', 'png', 'webp', 'gif', 'svg'],
    
    // Size limits
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxDimensions: {
      width: 4096,
      height: 4096
    },
    
    // Auto-processing on upload
    autoProcess: {
      generateVariants: true,
      optimizeOriginal: true,
      extractMetadata: true,
      generateThumbnails: true
    },
    
    // Security settings
    security: {
      scanForMalware: true,
      validateHeaders: true,
      stripExif: true,
      preventHotlinking: true
    }
  },

  // Analytics and monitoring
  analytics: {
    // Track image performance
    trackMetrics: [
      'requests_per_variant',
      'bandwidth_saved',
      'format_distribution',
      'device_type_usage',
      'cache_hit_rate',
      'transformation_time'
    ],
    
    // Performance thresholds
    performanceThresholds: {
      transformationTime: 500,  // Max 500ms for transformations
      cacheHitRate: 0.95,      // 95% cache hit rate target
      bandwidthSavings: 0.6    // 60% bandwidth savings target
    }
  },

  // Watermarking configuration
  watermark: {
    // Default watermark settings
    default: {
      opacity: 0.3,
      position: 'bottom-right',
      margin: 20,
      scale: 0.1 // 10% of image size
    },
    
    // Watermark variants
    variants: {
      subtle: {
        opacity: 0.2,
        position: 'bottom-right',
        scale: 0.08
      },
      prominent: {
        opacity: 0.5,
        position: 'center',
        scale: 0.15
      },
      corner: {
        opacity: 0.4,
        position: 'top-left',
        scale: 0.1
      }
    }
  },

  // Content-aware features
  contentAware: {
    // Smart cropping based on content
    smartCrop: {
      enabled: true,
      faceDetection: true,
      objectDetection: true,
      textDetection: true,
      gravityFallback: 'center'
    },
    
    // Automatic alt text generation
    altTextGeneration: {
      enabled: true,
      useAI: true,
      fallbackToFilename: true,
      maxLength: 125
    },
    
    // Content classification
    classification: {
      enabled: true,
      categories: ['cover', 'avatar', 'banner', 'illustration', 'screenshot'],
      autoTagging: true
    }
  }
};

// Image transformation utilities
const ImageTransforms = {
  // Generate responsive image URLs
  generateResponsiveUrls(imageId, variants = ['thumbnail', 'small', 'medium', 'large']) {
    return variants.map(variant => ({
      variant,
      url: `/images/${imageId}/${variant}`,
      ...IMAGES_CONFIG.variants[variant]
    }));
  },

  // Generate srcset for responsive images
  generateSrcSet(imageId, variants) {
    return variants.map(variant => {
      const config = IMAGES_CONFIG.variants[variant];
      return `/images/${imageId}/${variant} ${config.width}w`;
    }).join(', ');
  },

  // Generate sizes attribute
  generateSizes(breakpoints) {
    return breakpoints.map(bp => 
      `(max-width: ${bp.maxWidth}px) ${bp.size}`
    ).join(', ');
  },

  // Get optimal format for user agent
  getOptimalFormat(userAgent, acceptHeader) {
    const supportsAvif = acceptHeader?.includes('image/avif');
    const supportsWebp = acceptHeader?.includes('image/webp');
    
    if (supportsAvif) return 'avif';
    if (supportsWebp) return 'webp';
    return 'jpeg';
  },

  // Calculate bandwidth savings
  calculateBandwidthSavings(originalSize, optimizedSize) {
    return ((originalSize - optimizedSize) / originalSize) * 100;
  }
};

// Cloudflare Worker for image processing
const IMAGE_WORKER_SCRIPT = `
addEventListener('fetch', event => {
  event.respondWith(handleImageRequest(event.request));
});

async function handleImageRequest(request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  
  // Parse image request
  if (pathParts[1] === 'images') {
    const imageId = pathParts[2];
    const variant = pathParts[3] || 'original';
    
    // Check cache first
    const cacheKey = new Request(request.url);
    const cache = caches.default;
    let response = await cache.match(cacheKey);
    
    if (!response) {
      // Generate image transformation
      response = await transformImage(imageId, variant, request);
      
      // Cache the response
      if (response.ok) {
        const cacheResponse = response.clone();
        cacheResponse.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        await cache.put(cacheKey, cacheResponse);
      }
    }
    
    return response;
  }
  
  return new Response('Not found', { status: 404 });
}

async function transformImage(imageId, variant, request) {
  const config = ${JSON.stringify(IMAGES_CONFIG.variants)};
  const variantConfig = config[variant];
  
  if (!variantConfig) {
    return new Response('Invalid variant', { status: 400 });
  }
  
  // Get optimal format based on Accept header
  const acceptHeader = request.headers.get('Accept') || '';
  const format = getOptimalFormat(request.headers.get('User-Agent'), acceptHeader);
  
  // Build transformation URL
  const transformUrl = \`/cdn-cgi/image/width=\${variantConfig.width},height=\${variantConfig.height},fit=\${variantConfig.fit},quality=\${variantConfig.quality},format=\${format}/\${imageId}\`;
  
  // Fetch transformed image
  const imageResponse = await fetch(transformUrl);
  
  // Add optimization headers
  const response = new Response(imageResponse.body, {
    status: imageResponse.status,
    headers: {
      ...imageResponse.headers,
      'Content-Type': \`image/\${format}\`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Vary': 'Accept, User-Agent',
      'X-Image-Variant': variant,
      'X-Image-Format': format
    }
  });
  
  return response;
}

function getOptimalFormat(userAgent, acceptHeader) {
  if (acceptHeader.includes('image/avif')) return 'avif';
  if (acceptHeader.includes('image/webp')) return 'webp';
  return 'jpeg';
}
`;

// Export configuration
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    IMAGES_CONFIG,
    ImageTransforms,
    IMAGE_WORKER_SCRIPT
  };
}

console.log('Cloudflare Images configuration loaded');
console.log('Variants configured:', Object.keys(IMAGES_CONFIG.variants));
console.log('Optimization features enabled');
console.log('Content-aware processing configured');