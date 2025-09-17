/**
 * Artifact Statistics Dashboard
 * Analyzes and displays comprehensive statistics for historical artifact collections
 */
class ArtifactAnalyzer {
    constructor() {
        this.artifacts = [];
        this.map = null;
        this.timeframeBoundaries = [-5000000, -500000, -100000, -10000, -1000, 0, 500, 750, 1000, 1250, 1500, 1750, 1900, 2025];
        this.displayedArtifacts = 0;
        this.artifactsPerPage = 12;
        this.sortedArtifacts = [];
        this.currentSort = 'year-newest';
        this.authorStats = {};
        this.licenseStats = {};
        this.isLoading = false;
        this.chartInstances = {};
        this.imageQualityCache = new Map();
        this.imageAnalysisInProgress = false;
        this.imageAnalysisProgress = { current: 0, total: 0 };
        this.imageModal = null;
        
        // Bind methods to preserve context
        this.handleImageError = this.handleImageError.bind(this);
        this.handleSortChange = this.handleSortChange.bind(this);
        this.handleLoadMore = this.handleLoadMore.bind(this);
        this.handleLinkTest = this.handleLinkTest.bind(this);
        this.handleImageClick = this.handleImageClick.bind(this);
        this.handleModalClose = this.handleModalClose.bind(this);
        
        this.init();
    }

    async init() {
        try {
            this.showLoadingStates();
            this.setupImageModal();
            await this.loadArtifacts();
            this.analyzeArtifacts();
            this.displayStatistics();
            this.displayLists();
            this.displayLicenses();
            this.displayNonPlayableArtifacts();
            this.initMap();
            this.drawCharts();
            this.setupEventListeners();
            this.applySorting('year-newest');
            
            // Start image quality analysis in the background
            this.startImageQualityAnalysis();
        } catch (error) {
            console.error('Error initializing analyzer:', error);
            this.showError();
        }
    }

    setupImageModal() {
        this.imageModal = document.getElementById('imageModal');
        const closeBtn = this.imageModal?.querySelector('.image-modal-close');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', this.handleModalClose);
        }
        
        if (this.imageModal) {
            this.imageModal.addEventListener('click', (e) => {
                if (e.target === this.imageModal) {
                    this.handleModalClose();
                }
            });
        }

        // Keyboard support for modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.imageModal && this.imageModal.style.display !== 'none') {
                this.handleModalClose();
            }
        });
    }

    handleImageClick(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const img = e.target;
        const imageSrc = img.src;
        const imageAlt = img.alt;
        
        if (!this.imageModal || imageSrc === this.getPlaceholderImage()) {
            return;
        }
        
        const modalImage = this.imageModal.querySelector('#modalImage');
        const modalCaption = this.imageModal.querySelector('.image-modal-caption');
        
        if (modalImage && modalCaption) {
            modalImage.src = imageSrc;
            modalImage.alt = imageAlt;
            modalCaption.textContent = imageAlt;
            this.imageModal.style.display = 'flex';
            
            // Focus management for accessibility
            this.imageModal.focus();
        }
    }

    handleModalClose() {
        if (this.imageModal) {
            this.imageModal.style.display = 'none';
        }
    }

    showLoadingStates() {
        // Update all number displays to show loading state
        const numberElements = [
            'totalCount', 'avgTitleLength', 'avgLength', 'avgImageQuality',
            'uniqueLicenses', 'yearRange', 'playableCount', 'nonPlayableCount'
        ];
        
        numberElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = 'Loading...';
                element.setAttribute('aria-busy', 'true');
            }
        });
    }

    async loadArtifacts() {
        try {
            const response = await fetch('artifactlist.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            
            if (!data || !Array.isArray(data.artifacts)) {
                throw new Error('Invalid data format: Expected array of artifacts');
            }
            
            this.artifacts = data.artifacts;
            
            if (this.artifacts.length === 0) {
                throw new Error('No artifacts found in data file');
            }
            
        } catch (error) {
            console.error('Error loading artifacts:', error);
            throw new Error(`Failed to load artifact data: ${error.message}`);
        }
    }

    analyzeArtifacts() {
        // Enhance artifacts with calculated properties
        this.artifacts.forEach((artifact, index) => {
            artifact.id = artifact.id || `artifact_${index}`;
            artifact.descriptionLength = this.getStringLength(artifact.description);
            artifact.titleLength = this.getStringLength(artifact.title);
            artifact.imageQuality = null; // Will be calculated asynchronously
            artifact.imageQualityScore = 0;
            
            // Validate and normalize data
            if (typeof artifact.year === 'string') {
                artifact.year = parseInt(artifact.year, 10);
            }
            if (isNaN(artifact.year)) {
                artifact.year = null;
            }
        });

        // Calculate statistics
        this.calculateBasicStats();
        this.calculateAuthorStats();
        this.calculateLicenseStats();
        this.calculatePlayabilityStats();
        this.calculateYearRange();
        this.createSortedArrays();
    }

    getStringLength(str) {
        return str && typeof str === 'string' ? str.trim().length : 0;
    }

    calculateBasicStats() {
        this.totalCount = this.artifacts.length;
        
        const totalDescLength = this.artifacts.reduce((sum, artifact) => sum + artifact.descriptionLength, 0);
        const totalTitleLength = this.artifacts.reduce((sum, artifact) => sum + artifact.titleLength, 0);
        
        this.averageLength = this.totalCount > 0 ? totalDescLength / this.totalCount : 0;
        this.averageTitleLength = this.totalCount > 0 ? totalTitleLength / this.totalCount : 0;
        this.averageImageQuality = 0; // Will be calculated after image analysis
    }

    async startImageQualityAnalysis() {
        if (this.imageAnalysisInProgress) return;
        this.imageAnalysisInProgress = true;

        // Initialize progress tracking
        this.imageAnalysisProgress.current = 0;
        this.imageAnalysisProgress.total = this.artifacts.length;

        const avgElement = document.getElementById('avgImageQuality');
        const progressElements = {
            main: document.getElementById('imageQualityProgress'),
            highest: document.getElementById('highestQualityProgress'),
            lowest: document.getElementById('lowestQualityProgress')
        };

        // Update initial display
        if (avgElement) {
            avgElement.innerHTML = `
                <span class="main-text">Analyzing...</span>
                <span class="progress-text">0/${this.imageAnalysisProgress.total}</span>
            `;
        }

        // Update progress displays
        Object.values(progressElements).forEach(el => {
            if (el) {
                el.textContent = `0/${this.imageAnalysisProgress.total}`;
            }
        });

        try {
            await this.analyzeAllImageQualities();
            this.updateImageQualityStats();
            this.updateImageQualityLists();
            
            // Update display after analysis is complete
            if (avgElement) {
                avgElement.innerHTML = `
                    <span class="main-text">${Math.round(this.averageImageQuality)}/100</span>
                    <span class="progress-text">Complete</span>
                `;
                avgElement.removeAttribute('aria-busy');
            }

            // Clear progress displays
            Object.values(progressElements).forEach(el => {
                if (el) {
                    el.textContent = `${this.imageAnalysisProgress.total}/${this.imageAnalysisProgress.total} Complete`;
                }
            });

        } catch (error) {
            console.error('Error analyzing image qualities:', error);
            if (avgElement) {
                avgElement.innerHTML = `
                    <span class="main-text">Error</span>
                    <span class="progress-text">Analysis failed</span>
                `;
                avgElement.removeAttribute('aria-busy');
            }
        } finally {
            this.imageAnalysisInProgress = false;
        }
    }

    async analyzeAllImageQualities() {
        const progressElements = {
            main: document.getElementById('imageQualityProgress'),
            highest: document.getElementById('highestQualityProgress'),
            lowest: document.getElementById('lowestQualityProgress')
        };

        // Process artifacts one by one to show progress
        for (let i = 0; i < this.artifacts.length; i++) {
            await this.analyzeImageQuality(this.artifacts[i]);
            
            this.imageAnalysisProgress.current = i + 1;
            
            // Update progress displays
            const progressText = `${this.imageAnalysisProgress.current}/${this.imageAnalysisProgress.total}`;
            Object.values(progressElements).forEach(el => {
                if (el) {
                    el.textContent = progressText;
                }
            });

            // Update main quality display with running average
            const avgElement = document.getElementById('avgImageQuality');
            if (avgElement) {
                const validScores = this.artifacts.slice(0, i + 1)
                    .filter(a => a.imageQualityScore > 0)
                    .map(a => a.imageQualityScore);
                
                const currentAvg = validScores.length > 0 
                    ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length 
                    : 0;
                
                avgElement.innerHTML = `
                    <span class="main-text">${Math.round(currentAvg)}/100</span>
                    <span class="progress-text">${progressText}</span>
                `;
            }
            
            // Small delay between analyses to prevent UI blocking
            if (i % 5 === 0) {
                await this.delay(50);
            }
        }
    }

    async analyzeImageQuality(artifact) {
        if (!artifact.image) {
            artifact.imageQualityScore = 0;
            artifact.imageQuality = 'No Image';
            return;
        }

        if (this.imageQualityCache.has(artifact.image)) {
            const cached = this.imageQualityCache.get(artifact.image);
            artifact.imageQualityScore = cached.score;
            artifact.imageQuality = cached.quality;
            return;
        }

        try {
            const imageData = await this.loadImageData(artifact.image);
            const score = this.calculateQualityScore(imageData);
            
            artifact.imageQualityScore = score;
            artifact.imageQuality = this.getQualityLabel(score);
            
            // Cache the result
            this.imageQualityCache.set(artifact.image, {
                score: score,
                quality: artifact.imageQuality
            });
        } catch (error) {
            console.warn(`Failed to analyze image quality for ${artifact.title}:`, error);
            artifact.imageQualityScore = 0;
            artifact.imageQuality = 'Analysis Failed';
        }
    }

    loadImageData(imageUrl, timeout = 8000) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const startTime = Date.now();
            
            // Set up timeout
            const timeoutId = setTimeout(() => {
                reject(new Error('Image load timeout'));
            }, timeout);
            
            img.onload = () => {
                clearTimeout(timeoutId);
                const loadTime = Date.now() - startTime;
                resolve({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    loadTime: loadTime,
                    url: imageUrl
                });
            };
            
            img.onerror = () => {
                clearTimeout(timeoutId);
                reject(new Error('Failed to load image'));
            };
            
            img.src = imageUrl;
        });
    }

    calculateQualityScore(imageData) {
        const { width, height, loadTime, url } = imageData;
        
        // Base score from resolution
        const pixelCount = width * height;
        let score = 0;
        
        // Resolution scoring (0-60 points)
        if (pixelCount >= 2073600) { // 1920x1080 or higher
            score += 60;
        } else if (pixelCount >= 921600) { // 1280x720
            score += 50;
        } else if (pixelCount >= 480000) { // 800x600
            score += 40;
        } else if (pixelCount >= 230400) { // 640x360
            score += 30;
        } else if (pixelCount >= 76800) { // 320x240
            score += 20;
        } else {
            score += 10;
        }
        
        // Aspect ratio scoring (0-10 points)
        const aspectRatio = width / height;
        if (aspectRatio >= 0.8 && aspectRatio <= 1.25) {
            score += 10; // Good aspect ratio
        } else if (aspectRatio >= 0.5 && aspectRatio <= 2.0) {
            score += 8; // Acceptable aspect ratio
        } else {
            score += 5; // Poor aspect ratio
        }
        
        // Load time scoring (0-15 points) - faster loading suggests better optimization
        if (loadTime < 500) {
            score += 15;
        } else if (loadTime < 1000) {
            score += 12;
        } else if (loadTime < 2000) {
            score += 10;
        } else if (loadTime < 5000) {
            score += 8;
        } else {
            score += 5;
        }
        
        // File format bonus (0-10 points)
        const urlLower = url.toLowerCase();
        if (urlLower.includes('.webp')) {
            score += 10; // Modern format
        } else if (urlLower.includes('.png')) {
            score += 8; // Good for graphics
        } else if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) {
            score += 7; // Good for photos
        } else if (urlLower.includes('.svg')) {
            score += 9; // Vector graphics
        } else {
            score += 5; // Other formats
        }
        
        // Size bonus (0-5 points) - larger images generally better
        if (Math.min(width, height) >= 1000) {
            score += 5;
        } else if (Math.min(width, height) >= 500) {
            score += 4;
        } else if (Math.min(width, height) >= 300) {
            score += 3;
        } else {
            score += 2;
        }
        
        return Math.min(100, Math.max(0, score));
    }

    getQualityLabel(score) {
        if (score >= 80) return 'Excellent';
        if (score >= 65) return 'Good';
        if (score >= 45) return 'Average';
        if (score >= 25) return 'Poor';
        return 'Very Poor';
    }

    updateImageQualityStats() {
        const validScores = this.artifacts
            .filter(a => a.imageQualityScore > 0)
            .map(a => a.imageQualityScore);
        
        if (validScores.length > 0) {
            this.averageImageQuality = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
        } else {
            this.averageImageQuality = 0;
        }

        // Create sorted arrays for image quality
        this.artifactsByImageQuality = [...this.artifacts]
            .filter(a => a.imageQualityScore > 0)
            .sort((a, b) => b.imageQualityScore - a.imageQualityScore);
        
        this.artifactsByLowestImageQuality = [...this.artifacts]
            .filter(a => a.imageQualityScore > 0)
            .sort((a, b) => a.imageQualityScore - b.imageQualityScore);
    }

    updateImageQualityLists() {
        this.displayArtifactList('highestImageQualityList', this.artifactsByImageQuality.slice(0, 5), 'imageQuality');
        this.displayArtifactList('lowestImageQualityList', this.artifactsByLowestImageQuality.slice(0, 5), 'imageQuality');
    }

    calculateAuthorStats() {
        const authorMap = new Map();
        
        this.artifacts.forEach(artifact => {
            const author = this.normalizeAuthor(artifact.author);
            authorMap.set(author, (authorMap.get(author) || 0) + 1);
        });
        
        this.authorStats = Array.from(authorMap.entries())
            .map(([author, count]) => ({ author, count }))
            .sort((a, b) => b.count - a.count);
    }

    calculateLicenseStats() {
        const licenseMap = new Map();
        
        this.artifacts.forEach(artifact => {
            const license = this.normalizeLicense(artifact.license, artifact.author);
            licenseMap.set(license, (licenseMap.get(license) || 0) + 1);
        });
        
        this.licenseStats = Array.from(licenseMap.entries())
            .map(([license, count]) => ({ license, count }))
            .sort((a, b) => b.count - a.count);
    }

    calculatePlayabilityStats() {
        this.playabilityStats = this.artifacts.reduce((stats, artifact) => {
            if (artifact.isPlayable === true) {
                stats.playableCount++;
            } else if (artifact.isPlayable === false) {
                stats.nonPlayableCount++;
            }
            return stats;
        }, { playableCount: 0, nonPlayableCount: 0 });
    }

    calculateYearRange() {
        const validYears = this.artifacts
            .map(a => a.year)
            .filter(y => y !== null && y !== undefined && !isNaN(y));
        
        if (validYears.length > 0) {
            const minYear = Math.min(...validYears);
            const maxYear = Math.max(...validYears);
            this.yearRange = `${this.formatYear(minYear)} - ${this.formatYear(maxYear)}`;
        } else {
            this.yearRange = "No date data available";
        }
    }

    createSortedArrays() {
        // Pre-sort arrays for quick display
        this.artifactsByLength = [...this.artifacts]
            .sort((a, b) => b.descriptionLength - a.descriptionLength);
        this.artifactsByShortness = [...this.artifacts]
            .sort((a, b) => a.descriptionLength - b.descriptionLength);
        this.artifactsByTitleLength = [...this.artifacts]
            .sort((a, b) => b.titleLength - a.titleLength);
        this.artifactsByTitleShortness = [...this.artifacts]
            .sort((a, b) => a.titleLength - b.titleLength);
    }

    normalizeAuthor(author) {
        return author && typeof author === 'string' && author.trim() ? 
               author.trim() : 'Unknown Author';
    }

    normalizeLicense(license, author) {
        // Check if license is null/empty but author is "Public Domain"
        if ((!license || typeof license !== 'string' || !license.trim()) && 
            author && typeof author === 'string' && author.trim().toLowerCase() === 'public domain') {
            return 'Public Domain';
        }
        
        return license && typeof license === 'string' && license.trim() ? 
               license.trim() : 'No License';
    }

    formatYear(year) {
        if (year === null || year === undefined || isNaN(year)) {
            return 'Unknown';
        }
        return year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
    }

    displayStatistics() {
        // Remove loading states and display actual data
        const updates = [
            ['totalCount', this.totalCount.toLocaleString()],
            ['avgTitleLength', `${Math.round(this.averageTitleLength)} chars`],
            ['avgLength', `${Math.round(this.averageLength)} chars`],
            ['avgImageQuality', 'Analyzing...'], // Will be updated after image analysis
            ['uniqueLicenses', this.licenseStats.length.toString()],
            ['yearRange', this.yearRange],
            ['playableCount', this.playabilityStats.playableCount.toString()],
            ['nonPlayableCount', this.playabilityStats.nonPlayableCount.toString()]
        ];

        updates.forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                if (id === 'avgImageQuality') {
                    element.innerHTML = `
                        <span class="main-text">Analyzing...</span>
                        <span class="progress-text">0/${this.artifacts.length}</span>
                    `;
                } else {
                    element.textContent = value;
                    element.removeAttribute('aria-busy');
                }
            }
        });
    }

    displayLists() {
        this.displayArtifactList('longestTitlesList', this.artifactsByTitleLength.slice(0, 5), 'title');
        this.displayArtifactList('shortestTitlesList', this.artifactsByTitleShortness.slice(0, 5), 'title');
        this.displayArtifactList('longestList', this.artifactsByLength.slice(0, 5), 'description');
        this.displayArtifactList('shortestList', this.artifactsByShortness.slice(0, 5), 'description');
        
        // Image quality lists will be updated after analysis completes
        this.displayArtifactList('highestImageQualityList', [], 'imageQuality');
        this.displayArtifactList('lowestImageQualityList', [], 'imageQuality');
    }

    displayLicenses() {
        const container = document.getElementById('licenseGrid');
        if (!container) return;

        if (this.licenseStats.length === 0) {
            container.innerHTML = '<div class="loading">No license data available</div>';
            return;
        }

        container.innerHTML = '';
        this.licenseStats.forEach(({ license, count }) => {
            const element = document.createElement('div');
            element.className = 'license-item';
            element.innerHTML = `
                <div class="license-name">${this.escapeHtml(license)}</div>
                <div class="license-count">${count} artifact${count !== 1 ? 's' : ''}</div>
            `;
            container.appendChild(element);
        });
    }

    displayNonPlayableArtifacts() {
        const container = document.getElementById('nonPlayableList');
        if (!container) return;

        const nonPlayableArtifacts = this.artifacts.filter(artifact => artifact.isPlayable === false);
        
        if (nonPlayableArtifacts.length === 0) {
            container.innerHTML = '<div class="loading">No non-playable artifacts found</div>';
            return;
        }

        container.innerHTML = '';
        nonPlayableArtifacts.forEach((artifact, index) => {
            const artifactElement = this.createArtifactElement(artifact, index + 1, 'description');
            container.appendChild(artifactElement);
        });
    }

    displayArtifactList(containerId, artifacts, type) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (artifacts.length === 0) {
            if (type === 'imageQuality') {
                container.innerHTML = `
                    <div class="loading analysis-loading">
                        <span>Analyzing image quality...</span>
                        <span class="analysis-progress" id="${containerId === 'highestImageQualityList' ? 'highestQualityProgress' : 'lowestQualityProgress'}">0/${this.artifacts.length}</span>
                    </div>
                `;
            } else {
                container.innerHTML = '<div class="loading">No artifacts found</div>';
            }
            return;
        }

        container.innerHTML = '';
        artifacts.forEach((artifact, index) => {
            const artifactElement = this.createArtifactElement(artifact, index + 1, type);
            container.appendChild(artifactElement);
        });
    }

    createArtifactElement(artifact, rank, type) {
        const element = document.createElement('div');
        element.className = 'artifact-item';

        const year = this.formatYear(artifact.year);
        
        let lengthInfo = '';
        let displayContent = '';
        
        if (type === 'title') {
            lengthInfo = `<span class="title-length">${artifact.titleLength} chars</span>`;
            displayContent = this.createTitleDisplay(artifact, rank);
        } else if (type === 'description') {
            lengthInfo = `<span class="description-length">${artifact.descriptionLength} chars</span>`;
            displayContent = this.createDescriptionDisplay(artifact);
        } else if (type === 'imageQuality') {
            lengthInfo = this.createImageQualityBadge(artifact);
            displayContent = this.createImageQualityDisplay(artifact, rank);
        }
        
        element.innerHTML = `
            <img src="${this.escapeHtml(artifact.image)}" 
                 alt="${this.escapeHtml(artifact.title)}" 
                 class="artifact-image clickable-image" 
                 onerror="this.src='${this.getPlaceholderImage()}'" 
                 loading="lazy" 
                 style="cursor: pointer;" />
            <div class="artifact-info">
                ${displayContent}
                <div class="artifact-meta">
                    <span class="artifact-year">${year}</span>
                    ${lengthInfo}
                </div>
            </div>
        `;

        // Add click event listener to the image
        const img = element.querySelector('.artifact-image');
        if (img) {
            img.addEventListener('click', this.handleImageClick);
        }

        return element;
    }

    createTitleDisplay(artifact, rank) {
        return `<div class="artifact-title">#${rank}. ${this.escapeHtml(artifact.title)}</div>`;
    }

    createDescriptionDisplay(artifact) {
        const description = artifact.description || 'No description available.';
        return `
            <div class="artifact-title">${this.escapeHtml(artifact.title)}</div>
            <div class="artifact-description-full">${this.escapeHtml(description)}</div>
        `;
    }

    createImageQualityDisplay(artifact, rank) {
        return `
            <div class="artifact-title">#${rank}. ${this.escapeHtml(artifact.title)}</div>
            <div class="artifact-description-full">Quality Score: ${artifact.imageQualityScore}/100 (${artifact.imageQuality})</div>
        `;
    }

    createImageQualityBadge(artifact) {
        if (!artifact.imageQuality || artifact.imageQualityScore === 0) {
            return '<span class="artifact-badge">🖼️ Qual: Analyzing...</span>';
        }
        
        let qualityClass = 'quality-medium';
        if (artifact.imageQualityScore >= 80) {
            qualityClass = 'quality-high';
        } else if (artifact.imageQualityScore < 45) {
            qualityClass = 'quality-low';
        }
        
        return `<span class="artifact-badge">🖼️ Quality: ${artifact.imageQualityScore}/100</span>`;
    }

    setupEventListeners() {
        this.setupSortingControls();
        this.setupInfiniteScroll();
        this.setupLinkTesting();
        this.setupKeyboardNavigation();
    }

    setupSortingControls() {
        const sortSelect = document.getElementById('sortBySelect');
        const resetBtn = document.getElementById('resetSortBtn');

        if (sortSelect) {
            sortSelect.addEventListener('change', this.handleSortChange);
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.applySorting('year-newest');
                if (sortSelect) sortSelect.value = 'year-newest';
            });
        }

        this.updateSortInfo();
    }

    handleSortChange(e) {
        this.applySorting(e.target.value);
    }

    applySorting(sortType) {
        if (this.isLoading) return;
        
        this.currentSort = sortType;
        this.displayedArtifacts = 0;

        // Clear current display
        const container = document.getElementById('allArtifactsList');
        if (container) {
            container.innerHTML = '<div class="loading">Sorting artifacts...</div>';
        }

        // Apply sorting logic
        this.sortedArtifacts = this.getSortedArtifacts(sortType);
        
        this.updateSortInfo();
        this.loadMoreArtifacts();
    }

    getSortedArtifacts(sortType) {
        switch (sortType) {
            case 'year-newest':
                return [...this.artifacts].sort((a, b) => {
                    const yearA = a.year !== null && a.year !== undefined ? a.year : -Infinity;
                    const yearB = b.year !== null && b.year !== undefined ? b.year : -Infinity;
                    return yearB - yearA;
                });
            
            case 'year-oldest':
                return [...this.artifacts].sort((a, b) => {
                    const yearA = a.year !== null && a.year !== undefined ? a.year : Infinity;
                    const yearB = b.year !== null && b.year !== undefined ? b.year : Infinity;
                    return yearA - yearB;
                });

            case 'title-longest':
                return [...this.artifacts].sort((a, b) => b.titleLength - a.titleLength);

            case 'title-shortest':
                return [...this.artifacts].sort((a, b) => a.titleLength - b.titleLength);

            case 'description-longest':
                return [...this.artifacts].sort((a, b) => b.descriptionLength - a.descriptionLength);

            case 'description-shortest':
                return [...this.artifacts].sort((a, b) => a.descriptionLength - b.descriptionLength);

            case 'image-high-quality':
                return [...this.artifacts].sort((a, b) => {
                    // Sort by image quality score, highest first
                    return b.imageQualityScore - a.imageQualityScore;
                });

            case 'image-low-quality':
                return [...this.artifacts].sort((a, b) => {
                    // Sort by image quality score, lowest first (but exclude 0 scores)
                    const scoreA = a.imageQualityScore || 999;
                    const scoreB = b.imageQualityScore || 999;
                    return scoreA - scoreB;
                });

            case 'license-common':
                return this.sortByLicenseFrequency(false);

            case 'license-rare':
                return this.sortByLicenseFrequency(true);

            case 'author-common':
                return this.sortByAuthorFrequency(false);

            case 'author-rare':
                return this.sortByAuthorFrequency(true);

            default:
                return [...this.artifacts].sort((a, b) => {
                    const yearA = a.year !== null && a.year !== undefined ? a.year : -Infinity;
                    const yearB = b.year !== null && b.year !== undefined ? b.year : -Infinity;
                    return yearB - yearA;
                });
        }
    }

    sortByLicenseFrequency(rareFirst) {
        const licenseFrequency = {};
        this.licenseStats.forEach((stat, index) => {
            licenseFrequency[stat.license] = rareFirst ? index : this.licenseStats.length - index;
        });

        return [...this.artifacts].sort((a, b) => {
            const licenseA = this.normalizeLicense(a.license, a.author);
            const licenseB = this.normalizeLicense(b.license, b.author);
            const freqA = licenseFrequency[licenseA] || 0;
            const freqB = licenseFrequency[licenseB] || 0;
            
            if (freqA !== freqB) {
                return rareFirst ? freqA - freqB : freqB - freqA;
            }
            
            // Secondary sort by title for consistency
            return (a.title || '').localeCompare(b.title || '');
        });
    }

    sortByAuthorFrequency(rareFirst) {
        const authorFrequency = {};
        this.authorStats.forEach((stat, index) => {
            authorFrequency[stat.author] = rareFirst ? index : this.authorStats.length - index;
        });

        return [...this.artifacts].sort((a, b) => {
            const authorA = this.normalizeAuthor(a.author);
            const authorB = this.normalizeAuthor(b.author);
            const freqA = authorFrequency[authorA] || 0;
            const freqB = authorFrequency[authorB] || 0;
            
            if (freqA !== freqB) {
                return rareFirst ? freqA - freqB : freqB - freqA;
            }
            
            // Secondary sort by title for consistency
            return (a.title || '').localeCompare(b.title || '');
        });
    }

    updateSortInfo() {
        const sortInfo = document.getElementById('currentSortInfo');
        if (!sortInfo) return;

        const sortNames = {
            'year-newest': 'Year (Newest First)',
            'year-oldest': 'Year (Oldest First)',
            'title-longest': 'Title Length (Longest)',
            'title-shortest': 'Title Length (Shortest)',
            'description-longest': 'Description Length (Longest)',
            'description-shortest': 'Description Length (Shortest)',
            'image-high-quality': 'Image Quality (Highest)',
            'image-low-quality': 'Image Quality (Lowest)',
            'license-common': 'License (Most Common)',
            'license-rare': 'License (Rarest)',
            'author-common': 'Author (Most Common)',
            'author-rare': 'Author (Rarest)'
        };
        
        sortInfo.textContent = `Sorted by: ${sortNames[this.currentSort]}`;
    }

    setupInfiniteScroll() {
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        if (!loadMoreBtn) return;

        const button = loadMoreBtn.querySelector('.load-more-button');
        if (button) {
            button.addEventListener('click', this.handleLoadMore);
        }

        // Optional: Auto-load when scrolling near bottom
        const throttledScrollHandler = this.throttle(() => {
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000) {
                if (this.displayedArtifacts < this.sortedArtifacts.length && 
                    loadMoreBtn.style.display !== 'none' && !this.isLoading) {
                    this.loadMoreArtifacts();
                }
            }
        }, 250);

        window.addEventListener('scroll', throttledScrollHandler);
    }

    handleLoadMore() {
        if (!this.isLoading) {
            this.loadMoreArtifacts();
        }
    }

    loadMoreArtifacts() {
        if (this.isLoading || this.displayedArtifacts >= this.sortedArtifacts.length) {
            return;
        }

        this.isLoading = true;
        const container = document.getElementById('allArtifactsList');
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        
        if (!container) {
            this.isLoading = false;
            return;
        }

        // Clear loading message on first load
        if (this.displayedArtifacts === 0 && container.querySelector('.loading')) {
            container.innerHTML = '';
        }

        const endIndex = Math.min(
            this.displayedArtifacts + this.artifactsPerPage, 
            this.sortedArtifacts.length
        );
        const artifactsToShow = this.sortedArtifacts.slice(this.displayedArtifacts, endIndex);

        // Use document fragment for better performance
        const fragment = document.createDocumentFragment();
        artifactsToShow.forEach(artifact => {
            const artifactCard = this.createFullArtifactCard(artifact);
            fragment.appendChild(artifactCard);
        });
        container.appendChild(fragment);

        this.displayedArtifacts = endIndex;

        // Show/hide load more button
        if (loadMoreBtn) {
            if (this.displayedArtifacts >= this.sortedArtifacts.length) {
                loadMoreBtn.style.display = 'none';
            } else {
                loadMoreBtn.style.display = 'block';
            }
        }

        this.isLoading = false;
    }

    createFullArtifactCard(artifact) {
        const card = document.createElement('article');
        card.className = 'full-artifact-card';
        card.setAttribute('role', 'article');

        const year = this.formatYear(artifact.year);
        const license = this.normalizeLicense(artifact.license, artifact.author);
        const author = this.normalizeAuthor(artifact.author);

        const playabilityBadge = this.createPlayabilityBadge(artifact);
        const licenseBadge = this.createLicenseBadge(license);
        const imageQualityBadge = this.createImageQualityBadge(artifact);
        const authorElement = this.createAuthorElement(artifact, author);

        card.innerHTML = `
            <div class="artifact-header">
                <img src="${this.escapeHtml(artifact.image)}" 
                     alt="${this.escapeHtml(artifact.title)}" 
                     class="artifact-main-image clickable-image" 
                     onerror="this.src='${this.getPlaceholderImage()}'"
                     loading="lazy" 
                     style="cursor: pointer;" />
                <div class="artifact-header-info">
                    <h3 class="full-artifact-title">${this.escapeHtml(artifact.title)}</h3>
                    <div class="artifact-year-large">${year}</div>
                    <div class="artifact-badges">
                        ${playabilityBadge}
                        ${licenseBadge}
                        ${imageQualityBadge}
                    </div>
                </div>
            </div>
            
            <div class="artifact-description">${this.escapeHtml(artifact.description || 'No description available.')}</div>
            
            <div class="artifact-details">
                <div class="artifact-meta-info">
                    <div class="meta-row">
                        <span class="meta-icon" aria-hidden="true">👤</span>
                        <span>Author: ${authorElement}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-icon" aria-hidden="true">📝</span>
                        <span>Description: ${artifact.descriptionLength} characters</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-icon" aria-hidden="true">🏷️</span>
                        <span>Title: ${artifact.titleLength} characters</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-icon" aria-hidden="true">🖼️</span>
                        <span>Image Quality: ${artifact.imageQualityScore > 0 ? `${artifact.imageQualityScore}/100 (${artifact.imageQuality})` : 'Analyzing...'}</span>
                    </div>
                </div>
                <div class="artifact-mini-map" id="miniMap-${this.generateSafeId(artifact)}">
                    ${artifact.lat && artifact.lng ? '' : '<div class="mini-map-unavailable">🌍 Location not available</div>'}
                </div>
            </div>
        `;

        // Add click event listener to the main image
        const mainImg = card.querySelector('.artifact-main-image');
        if (mainImg) {
            mainImg.addEventListener('click', this.handleImageClick);
        }

        // Initialize mini-map if coordinates are available
        if (artifact.lat && artifact.lng && this.isValidCoordinates(artifact.lat, artifact.lng)) {
            setTimeout(() => {
                this.initMiniMap(artifact, `miniMap-${this.generateSafeId(artifact)}`);
            }, 100);
        }

        return card;
    }

    createPlayabilityBadge(artifact) {
        if (artifact.isPlayable === true) {
            return '<span class="artifact-badge badge-playable">🎮 Playable</span>';
        } else if (artifact.isPlayable === false) {
            return '<span class="artifact-badge badge-non-playable">🚫 Non-Playable</span>';
        } else {
            return '<span class="artifact-badge">❓ Unknown</span>';
        }
    }

    createLicenseBadge(license) {
        return license !== 'No License' ? 
            `<span class="artifact-badge">⚖️ ${this.escapeHtml(license)}</span>` :
            '<span class="artifact-badge badge-no-license">⚖️ No License</span>';
    }

    createAuthorElement(artifact, author) {
        return artifact.authorLink && this.isValidUrl(artifact.authorLink) ? 
            `<a href="${this.escapeHtml(artifact.authorLink)}" target="_blank" rel="noopener noreferrer" class="author-link" title="Visit author's page">${this.escapeHtml(author)}</a>` :
            this.escapeHtml(author);
    }

    generateSafeId(artifact) {
        return (artifact.id || artifact.title || 'unknown')
            .replace(/[^a-zA-Z0-9]/g, '_')
            .substring(0, 50);
    }

    isValidCoordinates(lat, lng) {
        return typeof lat === 'number' && typeof lng === 'number' &&
               !isNaN(lat) && !isNaN(lng) &&
               lat >= -90 && lat <= 90 &&
               lng >= -180 && lng <= 180;
    }

    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    initMiniMap(artifact, containerId) {
        try {
            const container = document.getElementById(containerId);
            if (!container || container.querySelector('.leaflet-container')) return;

            const miniMap = L.map(containerId, {
                zoomControl: false,
                scrollWheelZoom: false,
                doubleClickZoom: false,
                boxZoom: false,
                keyboard: false,
                dragging: false,
                tap: false,
                touchZoom: false
            }).setView([artifact.lat, artifact.lng], 8);

            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
                attribution: '',
                maxZoom: 18
            }).addTo(miniMap);

            const marker = L.marker([artifact.lat, artifact.lng], {
                icon: L.divIcon({
                    className: 'custom-marker',
                    html: '<div style="background-color: #ff4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                })
            }).addTo(miniMap);

            // Make mini-map clickable to focus main map
            container.style.cursor = 'pointer';
            container.addEventListener('click', () => {
                if (this.map) {
                    this.map.setView([artifact.lat, artifact.lng], 10);
                    document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' });
                }
            });

            // Add keyboard accessibility
            container.setAttribute('tabindex', '0');
            container.setAttribute('role', 'button');
            container.setAttribute('aria-label', `View ${artifact.title} location on main map`);
            
            container.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    container.click();
                }
            });

        } catch (error) {
            console.error('Error initializing mini-map:', error);
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div class="mini-map-unavailable">🌍 Map unavailable</div>';
            }
        }
    }

    initMap() {
        try {
            // Initialize Leaflet map
            this.map = L.map('map').setView([30, 0], 2);

            // Add tile layer with error handling
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
                attribution: '&copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012',
                maxZoom: 18
            }).addTo(this.map);

            // Add markers for artifacts with valid coordinates
            const validArtifacts = this.artifacts.filter(artifact => 
                this.isValidCoordinates(artifact.lat, artifact.lng)
            );

            validArtifacts.forEach(artifact => {
                const marker = L.marker([artifact.lat, artifact.lng], {
                    icon: L.divIcon({
                        className: 'custom-marker',
                        html: '<div style="background-color: #ff4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
                        iconSize: [16, 16],
                        iconAnchor: [8, 8]
                    })
                }).addTo(this.map);

                const year = this.formatYear(artifact.year);
                const popupContent = `
                    <div class="popup-title">${this.escapeHtml(artifact.title)}</div>
                    <div class="popup-year">${year}</div>
                    <img src="${this.escapeHtml(artifact.image)}" 
                         alt="${this.escapeHtml(artifact.title)}" 
                         class="popup-image clickable-image" 
                         onerror="this.style.display='none'"
                         loading="lazy" 
                         style="cursor: pointer;" />
                    <div style="margin-top: 10px; font-size: 0.85rem;">${this.escapeHtml(artifact.description || '')}</div>
                `;
                
                marker.bindPopup(popupContent, {
                    maxWidth: 200,
                    className: 'custom-popup'
                });

                // Add click event to popup images when they're created
                marker.on('popupopen', () => {
                    const popupImg = document.querySelector('.leaflet-popup .popup-image');
                    if (popupImg) {
                        popupImg.addEventListener('click', this.handleImageClick);
                    }
                });
            });

        } catch (error) {
            console.error('Error initializing map:', error);
            const mapContainer = document.getElementById('map');
            if (mapContainer) {
                mapContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--light-green);">Map unavailable</div>';
            }
        }
    }

    drawCharts() {
        try {
            this.drawLengthChart();
            this.drawYearChart();
        } catch (error) {
            console.error('Error drawing charts:', error);
        }
    }

    drawLengthChart() {
        const ctx = document.getElementById('lengthChart')?.getContext('2d');
        if (!ctx) return;

        try {
            // Destroy existing chart if it exists
            if (this.chartInstances.lengthChart) {
                this.chartInstances.lengthChart.destroy();
            }

            const lengths = this.artifacts.map(a => a.descriptionLength);
            const maxLength = Math.max(...lengths);
            const minLength = Math.min(...lengths);
            const bucketCount = 15;
            const bucketSize = Math.max(1, (maxLength - minLength) / bucketCount);
            
            const buckets = new Array(bucketCount).fill(0);
            const bucketLabels = [];
            
            lengths.forEach(length => {
                const bucketIndex = Math.min(Math.floor((length - minLength) / bucketSize), bucketCount - 1);
                buckets[bucketIndex]++;
            });

            // Create labels for buckets
            for (let i = 0; i < bucketCount; i++) {
                const start = Math.round(minLength + i * bucketSize);
                const end = Math.round(minLength + (i + 1) * bucketSize);
                bucketLabels.push(`${start}-${end}`);
            }

            this.chartInstances.lengthChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: bucketLabels,
                    datasets: [{
                        label: 'Number of Artifacts',
                        data: buckets,
                        backgroundColor: 'rgba(153, 238, 153, 0.6)',
                        borderColor: '#99EE99',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: '#99EE99'
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: '#99EE99'
                            },
                            grid: {
                                color: 'rgba(153, 238, 153, 0.2)'
                            }
                        },
                        x: {
                            ticks: {
                                color: '#99EE99',
                                maxRotation: 45
                            },
                            grid: {
                                color: 'rgba(153, 238, 153, 0.2)'
                            }
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Error creating length chart:', error);
        }
    }

    drawYearChart() {
        const ctx = document.getElementById('yearChart')?.getContext('2d');
        if (!ctx) return;

        try {
            // Destroy existing chart if it exists
            if (this.chartInstances.yearChart) {
                this.chartInstances.yearChart.destroy();
            }

            const timeframeCounts = new Array(this.timeframeBoundaries.length - 1).fill(0);
            const timeframeLabels = [];
            
            // Create labels for timeframes
            for (let i = 0; i < this.timeframeBoundaries.length - 1; i++) {
                const start = this.timeframeBoundaries[i];
                const end = this.timeframeBoundaries[i + 1];
                
                let label;
                if (start < 0 && end <= 0) {
                    label = `${Math.abs(end)} - ${Math.abs(start)} BCE`;
                } else if (start < 0 && end > 0) {
                    label = `${Math.abs(start)} BCE - ${end} CE`;
                } else {
                    label = `${start} - ${end} CE`;
                }
                
                timeframeLabels.push(label);
            }

            // Count artifacts in each timeframe
            this.artifacts.forEach(artifact => {
                if (artifact.year !== null && artifact.year !== undefined && !isNaN(artifact.year)) {
                    for (let i = 0; i < this.timeframeBoundaries.length - 1; i++) {
                        const start = this.timeframeBoundaries[i];
                        const end = this.timeframeBoundaries[i + 1];
                        
                        if (artifact.year >= start && artifact.year < end) {
                            timeframeCounts[i]++;
                            break;
                        }
                    }
                }
            });

            this.chartInstances.yearChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: timeframeLabels,
                    datasets: [{
                        label: 'Artifacts per Timeframe',
                        data: timeframeCounts,
                        backgroundColor: 'rgba(255, 215, 0, 0.2)',
                        borderColor: '#FFD700',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#FFFF00',
                        pointBorderColor: '#FFD700',
                        pointRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: '#99EE99'
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: '#99EE99'
                            },
                            grid: {
                                color: 'rgba(153, 238, 153, 0.2)'
                            }
                        },
                        x: {
                            ticks: {
                                color: '#99EE99',
                                maxRotation: 45
                            },
                            grid: {
                                color: 'rgba(153, 238, 153, 0.2)'
                            }
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Error creating year chart:', error);
        }
    }

    setupLinkTesting() {
        const testButton = document.getElementById('testLinksBtn');
        if (testButton) {
            testButton.addEventListener('click', this.handleLinkTest);
        }
    }

    async handleLinkTest() {
        const testButton = document.getElementById('testLinksBtn');
        const testProgress = document.getElementById('testProgress');
        const testResults = document.getElementById('testResults');
        
        if (!testButton || !testProgress || !testResults) return;

        testButton.disabled = true;
        testButton.textContent = 'Testing Links...';
        testProgress.style.display = 'block';
        testResults.innerHTML = '';

        const brokenLinks = [];
        const totalTests = this.artifacts.length * 2; // Image + author link for each
        let completed = 0;

        try {
            for (const artifact of this.artifacts) {
                // Test image URL
                if (artifact.image) {
                    try {
                        const imageResponse = await this.testUrl(artifact.image);
                        if (!imageResponse.ok) {
                            brokenLinks.push({
                                artifact: artifact.title,
                                url: artifact.image,
                                type: 'Image',
                                error: `HTTP ${imageResponse.status || 'Unknown'}`
                            });
                        }
                    } catch (error) {
                        brokenLinks.push({
                            artifact: artifact.title,
                            url: artifact.image,
                            type: 'Image',
                            error: error.message || 'Connection failed'
                        });
                    }
                }

                completed++;
                testProgress.textContent = `Testing links... ${completed}/${totalTests} (${Math.round(completed/totalTests*100)}%)`;

                // Test author link if it exists
                if (artifact.authorLink && this.isValidUrl(artifact.authorLink)) {
                    try {
                        const authorResponse = await this.testUrl(artifact.authorLink);
                        if (!authorResponse.ok) {
                            brokenLinks.push({
                                artifact: artifact.title,
                                url: artifact.authorLink,
                                type: 'Author Link',
                                error: `HTTP ${authorResponse.status || 'Unknown'}`
                            });
                        }
                    } catch (error) {
                        brokenLinks.push({
                            artifact: artifact.title,
                            url: artifact.authorLink,
                            type: 'Author Link',
                            error: error.message || 'Connection failed'
                        });
                    }
                }

                completed++;
                testProgress.textContent = `Testing links... ${completed}/${totalTests} (${Math.round(completed/totalTests*100)}%)`;

                // Small delay to prevent overwhelming the servers
                await this.delay(50);
            }

            // Display results
            this.displayTestResults(brokenLinks, totalTests, testProgress, testResults);

        } catch (error) {
            console.error('Error during link testing:', error);
            testResults.innerHTML = `
                <div class="error-message">
                    <h3>Error During Testing</h3>
                    <p>Testing was interrupted: ${error.message}</p>
                </div>
            `;
        } finally {
            testProgress.style.display = 'none';
            testButton.disabled = false;
            testButton.textContent = 'Test Every Artifact Link';
        }
    }

    displayTestResults(brokenLinks, totalTests, testProgress, testResults) {
        testProgress.style.display = 'none';

        if (brokenLinks.length === 0) {
            testResults.innerHTML = `
                <div class="success-message">
                    <strong>✅ All Links Working!</strong><br>
                    All ${totalTests} links tested successfully.
                </div>
            `;
        } else {
            testResults.innerHTML = `
                <div style="background: rgba(255, 100, 100, 0.2); border: 2px solid #ff4444; border-radius: 10px; padding: 20px; margin-bottom: 20px; text-align: center;">
                    <strong>⚠️ Found ${brokenLinks.length} broken link${brokenLinks.length !== 1 ? 's' : ''}</strong>
                </div>
            `;

            brokenLinks.forEach(link => {
                const brokenElement = document.createElement('div');
                brokenElement.className = 'broken-link';
                brokenElement.innerHTML = `
                    <div class="broken-link-title">${this.escapeHtml(link.artifact)} - ${this.escapeHtml(link.type)}</div>
                    <div class="broken-link-url">${this.escapeHtml(link.url)}</div>
                    <div style="color: #ff6666; font-size: 0.8rem; margin-top: 5px;">Error: ${this.escapeHtml(link.error)}</div>
                `;
                testResults.appendChild(brokenElement);
            });
        }
    }

    async testUrl(url, timeout = 8000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            // For images, try to load them as images first
            if (this.isImageUrl(url)) {
                clearTimeout(timeoutId);
                return await this.testImageUrl(url, timeout);
            }

            // For other URLs, try fetch with no-cors
            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                mode: 'no-cors'
            });
            clearTimeout(timeoutId);
            return { ok: true, status: 200 };
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }

    testImageUrl(url, timeout = 8000) {
        return new Promise((resolve) => {
            const img = new Image();
            const timeoutId = setTimeout(() => {
                resolve({ ok: false, status: 408 });
            }, timeout);

            img.onload = () => {
                clearTimeout(timeoutId);
                resolve({ ok: true, status: 200 });
            };

            img.onerror = () => {
                clearTimeout(timeoutId);
                resolve({ ok: false, status: 404 });
            };

            img.src = url;
        });
    }

    isImageUrl(url) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
        const urlLower = url.toLowerCase();
        return imageExtensions.some(ext => urlLower.includes(ext));
    }

    setupKeyboardNavigation() {
        // Add keyboard navigation for interactive elements
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Close any open popups
                if (this.map) {
                    this.map.closePopup();
                }
                // Close image modal
                if (this.imageModal && this.imageModal.style.display !== 'none') {
                    this.handleModalClose();
                }
            }
        });
    }

    // Utility methods
    escapeHtml(text) {
        if (!text || typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getPlaceholderImage() {
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjZjBmMGYwIi8+CjxwYXRoIGQ9Ik04MCA4MEgxMjBWMTIwSDgwVjgwWiIgZmlsbD0iI2NjYyIvPgo8L3N2Zz4K';
    }

    handleImageError(img) {
        img.src = this.getPlaceholderImage();
        img.alt = 'Image not available';
    }

    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    showError() {
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) {
            errorMessage.style.display = 'block';
        }

        // Update all displays to show error state
        const errorElements = [
            'totalCount', 'avgTitleLength', 'avgLength', 'avgImageQuality',
            'uniqueLicenses', 'yearRange', 'playableCount', 'nonPlayableCount'
        ];
        
        errorElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = 'Error';
                element.removeAttribute('aria-busy');
            }
        });

        const listElements = [
            'longestTitlesList', 'shortestTitlesList', 
            'longestList', 'shortestList', 'licenseGrid', 
            'nonPlayableList', 'allArtifactsList',
            'highestImageQualityList', 'lowestImageQualityList'
        ];
        
        listElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.innerHTML = '<div class="loading">Could not load data</div>';
            }
        });
    }

    // Public method to destroy the analyzer and clean up resources
    destroy() {
        // Destroy chart instances
        Object.values(this.chartInstances).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });

        // Destroy map
        if (this.map) {
            this.map.remove();
        }

        // Remove event listeners
        window.removeEventListener('scroll', this.handleScroll);
        
        // Clear references
        this.artifacts = [];
        this.map = null;
        this.chartInstances = {};
        this.imageQualityCache.clear();
    }
}

// Initialize the analyzer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if required dependencies are loaded
    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded');
        return;
    }
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library not loaded');
        return;
    }

    // Initialize the analyzer
    window.artifactAnalyzer = new ArtifactAnalyzer();
});

// Handle page unload cleanup
window.addEventListener('beforeunload', () => {
    if (window.artifactAnalyzer && typeof window.artifactAnalyzer.destroy === 'function') {
        window.artifactAnalyzer.destroy();
    }
});