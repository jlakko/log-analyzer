import React, { useState, useEffect, useMemo, useCallback } from 'react';

// Get available timezones
const getTimezones = () => {
    const timezones = Intl.supportedValuesOf('timeZone');
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Popular timezones first, then user's timezone if not in popular list
    const popularTimezones = [
        'America/New_York',
        'America/Chicago', 
        'America/Denver',
        'America/Los_Angeles',
        'America/Toronto',
        'Europe/London',
        'Europe/Paris',
        'Europe/Berlin',
        'Asia/Tokyo',
        'Asia/Shanghai',
        'Australia/Sydney',
        'UTC'
    ];
    
    const result = [...popularTimezones];
    if (!popularTimezones.includes(userTimezone)) {
        result.unshift(userTimezone);
    }
    
    // Add remaining timezones
    timezones.forEach(tz => {
        if (!result.includes(tz)) {
            result.push(tz);
        }
    });
    
    return result;
};

// Detect if a column name likely contains timestamps
const isTimestampColumn = (columnName, sampleValues = []) => {
    const name = columnName.toLowerCase();
    
    // Common timestamp column names
    const timestampPatterns = [
        /^ts$/,
        /^time/,
        /^timestamp/,
        /^date/,
        /^created/,
        /^updated/,
        /^modified/,
        /.*_time$/,
        /.*_date$/,
        /.*_ts$/,
        /^start/,
        /^end/,
        /^event_time/,
        /^log_time/,
        /^occur/,
        /@timestamp/,
        /^when$/,
        /^at$/
    ];
    
    // Check if column name matches timestamp patterns
    const nameMatches = timestampPatterns.some(pattern => pattern.test(name));
    
    // Check if sample values look like timestamps
    const valueMatches = sampleValues.slice(0, 3).some(value => {
        if (!value) return false;
        const str = String(value);
        
        // Unix timestamps (10 or 13 digits)
        if (/^\d{10}(\.\d+)?$/.test(str) || /^\d{13}$/.test(str)) return true;
        
        // ISO 8601 format
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) return true;
        
        // Other date formats
        const parsed = new Date(str);
        return !isNaN(parsed.getTime()) && parsed.getFullYear() > 1990;
    });
    
    return nameMatches || valueMatches;
};

// Flexible timestamp parser that handles various formats
const parseTimestamp = (timestamp) => {
    if (!timestamp) return null;
    
    // Handle Unix timestamps (seconds or milliseconds)
    if (typeof timestamp === 'number') {
        // If it's a 10-digit number, it's likely seconds; if 13-digit, milliseconds
        return timestamp > 1e12 ? new Date(timestamp) : new Date(timestamp * 1000);
    }
    
    const str = String(timestamp);
    
    // Unix timestamp as string
    if (/^\d{10}$/.test(str)) {
        return new Date(parseInt(str) * 1000);
    }
    if (/^\d{13}$/.test(str)) {
        return new Date(parseInt(str));
    }
    
    // Decimal unix timestamp (like 1234567890.123)
    if (/^\d{10}\.\d+$/.test(str)) {
        return new Date(parseFloat(str) * 1000);
    }
    
    // ISO 8601 format
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) {
        return new Date(str);
    }
    
    // Try to parse as a regular date
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
};

// Format timestamp for display
const formatTimestamp = (timestamp, timezone, humanReadable) => {
    if (!humanReadable) {
        return String(timestamp);
    }
    
    const date = parseTimestamp(timestamp);
    if (!date) {
        return String(timestamp);
    }
    
    try {
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: timezone,
            timeZoneName: 'short'
        }).format(date);
    } catch (error) {
        // Fallback if timezone is invalid
        return date.toLocaleString();
    }
};

// Extract all unique keys from an array of objects, including nested objects
// Only include keys that have actual values (not null/undefined) in at least one log entry
const extractAllKeys = (objects) => {
    const keyValueCounts = new Map();
    
    const traverse = (obj, prefix = '') => {
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            Object.keys(obj).forEach(key => {
                const fullKey = prefix ? `${prefix}.${key}` : key;
                const value = obj[key];
                
                // Only count this key if it has a meaningful value
                if (value !== null && value !== undefined && value !== '') {
                    keyValueCounts.set(fullKey, (keyValueCounts.get(fullKey) || 0) + 1);
                }
                
                // Recursively traverse nested objects (but limit depth to avoid performance issues)
                // Skip recursion if we're already dealing with a literal dot key at the top level
                if (prefix === '' && value && typeof value === 'object' && !Array.isArray(value) && !key.includes('.')) {
                    traverse(value, fullKey);
                } else if (prefix !== '' && prefix.split('.').length < 3 && value && typeof value === 'object' && !Array.isArray(value)) {
                    traverse(value, fullKey);
                }
            });
        }
    };
    
    objects.forEach(obj => traverse(obj));
    
    // Return only keys that have values in at least one entry
    return Array.from(keyValueCounts.keys()).sort();
};

// Get nested value from object using dot notation
// First try the path as a literal key, then try as nested path
const getNestedValue = (obj, path) => {
    // First, try the path as a literal key name (handles keys like "id.orig_h")
    if (obj && obj[path] !== undefined) {
        return obj[path];
    }
    
    // If that fails, try as a nested path (handles paths like "user.profile.name")
    return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
};

// Analyze log structure and detect timestamp columns
const analyzeLogStructure = (logs) => {
    if (!logs || logs.length === 0) return { columns: [], timestampColumns: [] };
    
    const allKeys = extractAllKeys(logs);
    const timestampColumns = [];
    
    // Check each column to see if it contains timestamps
    allKeys.forEach(key => {
        const sampleValues = logs.slice(0, 10).map(log => getNestedValue(log, key)).filter(v => v !== undefined);
        if (isTimestampColumn(key, sampleValues)) {
            timestampColumns.push(key);
        }
    });
    
    return { columns: allKeys, timestampColumns };
};

// Reorder columns to put timestamp columns first
const reorderColumns = (allColumns, timestampColumns) => {
    const nonTimestampColumns = allColumns.filter(col => !timestampColumns.includes(col));
    return [...timestampColumns, ...nonTimestampColumns];
};

// Icon for sorting arrows
const SortIcon = ({ direction }) => {
    if (!direction) return <svg className="h-4 w-4 inline-block text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>;
    return direction === 'ascending' ? (
        <svg className="h-4 w-4 inline-block text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
    ) : (
        <svg className="h-4 w-4 inline-block text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
    );
};

// File Upload Component
const FileUploader = ({ onFileUpload, setIsLoading, setError }) => {
    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        processFile(file);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const file = event.dataTransfer.files[0];
        if (file) {
            processFile(file);
        }
    };

    const handleDragOver = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };
    
    const processFile = (file) => {
        setIsLoading(true);
        setError(null);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const parsedLogs = text
                    .split('\n')
                    .filter(line => line.trim() !== '')
                    .map(line => JSON.parse(line));
                onFileUpload(parsedLogs, file.name);
            } catch (err) {
                console.error("Error parsing file:", err);
                setError(`Failed to parse ${file.name}. Please ensure it is a newline-delimited JSON file.`);
                onFileUpload([], null);
            } finally {
                setIsLoading(false);
            }
        };
        reader.onerror = () => {
            setError(`Error reading file: ${reader.error}`);
            setIsLoading(false);
        };
        reader.readAsText(file);
    };

    return (
        <div 
            className="w-full p-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center cursor-pointer hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => document.getElementById('file-input').click()}
        >
            <input
                type="file"
                id="file-input"
                className="hidden"
                accept=".json,.log"
                onChange={handleFileChange}
            />
            <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
                <span className="font-semibold text-blue-600 dark:text-blue-500">Click to upload</span> or drag and drop
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Newline-delimited JSON files (.json, .log)</p>
        </div>
    );
};


// Main Application Component
export default function App() {
    // --- STATE MANAGEMENT ---
    const [allLogs, setAllLogs] = useState([]);
    const [fileName, setFileName] = useState(null);
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const savedMode = localStorage.getItem('darkMode');
        return savedMode === 'true' || false;
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // State for log structure analysis
    const [logStructure, setLogStructure] = useState({ columns: [], timestampColumns: [] });

    // State for timestamp formatting
    const [humanReadableTime, setHumanReadableTime] = useState(false);
    const [selectedTimezone, setSelectedTimezone] = useState(
        Intl.DateTimeFormat().resolvedOptions().timeZone
    );

    // State for individual timestamp column toggles
    const [enabledTimestampColumns, setEnabledTimestampColumns] = useState(new Set());

    // State for filtering - now dynamic
    const [filters, setFilters] = useState({});

    // State for sorting
    const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
    
    // State for pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 25;

    // Memoized ordered columns (timestamp columns first)
    const orderedColumns = useMemo(() => {
        return reorderColumns(logStructure.columns, logStructure.timestampColumns);
    }, [logStructure.columns, logStructure.timestampColumns]);

    // Analyze log structure when logs change
    useEffect(() => {
        if (allLogs.length > 0) {
            const structure = analyzeLogStructure(allLogs);
            setLogStructure(structure);
            
            // Initialize filters for all columns
            const initialFilters = {};
            structure.columns.forEach(column => {
                initialFilters[column] = '';
            });
            setFilters(initialFilters);
            
            // Enable all detected timestamp columns by default
            setEnabledTimestampColumns(new Set(structure.timestampColumns));
            
            // Set default sort to first timestamp column or first column
            const defaultSortKey = structure.timestampColumns[0] || structure.columns[0];
            if (defaultSortKey) {
                setSortConfig({ key: defaultSortKey, direction: 'descending' });
            }
        } else {
            setLogStructure({ columns: [], timestampColumns: [] });
            setFilters({});
            setEnabledTimestampColumns(new Set());
            setSortConfig({ key: null, direction: null });
        }
    }, [allLogs]);

    // Effect to apply dark mode
    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('darkMode', 'true');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('darkMode', 'false');
        }
    }, [isDarkMode]);
    
    // Memoized filtered and sorted logs
    const processedLogs = useMemo(() => {
        let logs = [...allLogs];

        // Apply filters
        logs = logs.filter(log => {
            return Object.keys(filters).every(key => {
                const filterValue = filters[key]?.toLowerCase();
                if (!filterValue) return true;
                const logValue = getNestedValue(log, key);
                const stringValue = logValue ? String(logValue).toLowerCase() : '';
                return stringValue.includes(filterValue);
            });
        });

        // Apply sorting
        if (sortConfig.key) {
            logs.sort((a, b) => {
                const aValue = getNestedValue(a, sortConfig.key) || '';
                const bValue = getNestedValue(b, sortConfig.key) || '';

                // Handle numeric sorting for timestamps and numbers
                const aNum = Number(aValue);
                const bNum = Number(bValue);
                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return sortConfig.direction === 'ascending' ? aNum - bNum : bNum - aNum;
                }

                // String sorting
                const aStr = String(aValue);
                const bStr = String(bValue);
                if (aStr < bStr) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aStr > bStr) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        
        return logs;
    }, [filters, sortConfig, allLogs]);

    useEffect(() => {
        setCurrentPage(1); // Reset to first page on data change
    }, [processedLogs]);

    // --- HANDLERS ---
    const handleFileUpload = useCallback((logs, name) => {
        setAllLogs(logs);
        setFileName(name);
        if(logs.length > 0) setError(null);
    }, []);
    
    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleCellClick = (columnKey, value) => {
        // Don't filter on empty/null/undefined values
        if (value === null || value === undefined || value === 'N/A' || String(value).trim() === '') {
            return;
        }
        
        // Set the filter for this column to the clicked value
        setFilters(prev => ({ 
            ...prev, 
            [columnKey]: String(value)
        }));
        
        // Reset to first page when filtering
        setCurrentPage(1);
    };

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const handleTimestampColumnToggle = (columnKey) => {
        setEnabledTimestampColumns(prev => {
            const newSet = new Set(prev);
            if (newSet.has(columnKey)) {
                newSet.delete(columnKey);
            } else {
                newSet.add(columnKey);
            }
            return newSet;
        });
    };
    
    const clearData = () => {
        setAllLogs([]);
        setFileName(null);
        setError(null);
        setFilters({});
        setLogStructure({ columns: [], timestampColumns: [] });
        setEnabledTimestampColumns(new Set());
        setSortConfig({ key: null, direction: null });
    };

    const clearAllFilters = () => {
        const clearedFilters = {};
        logStructure.columns.forEach(column => {
            clearedFilters[column] = '';
        });
        setFilters(clearedFilters);
        setCurrentPage(1);
    };

    // --- PAGINATION LOGIC ---
    const paginatedLogs = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return processedLogs.slice(startIndex, startIndex + itemsPerPage);
    }, [processedLogs, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(processedLogs.length / itemsPerPage);

    // Generate column display name
    const getColumnDisplayName = (columnKey) => {
        return columnKey
            .split('.')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' > ');
    };

    // Check if a column should be formatted as timestamp
    const shouldFormatAsTimestamp = (columnKey) => {
        return humanReadableTime && 
               logStructure.timestampColumns.includes(columnKey) && 
               enabledTimestampColumns.has(columnKey);
    };

    // --- RENDER ---
    const availableTimezones = useMemo(() => getTimezones(), []);

    return (
        <div className="bg-gray-50 dark:bg-gray-900 min-h-screen font-sans text-gray-800 dark:text-gray-200">
            <div className="container mx-auto p-4 sm:p-6 lg:p-8">
                <header className="mb-8 flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Log Analyzer</h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">
                            {fileName ? `Analyzing: ${fileName}` : "Upload a log file to begin."}
                        </p>
                        {logStructure.columns.length > 0 && (
                            <p className="text-sm text-gray-500 mt-1">
                                {logStructure.columns.length} columns detected
                                {logStructure.timestampColumns.length > 0 && 
                                    ` • ${logStructure.timestampColumns.length} timestamp column${logStructure.timestampColumns.length > 1 ? 's' : ''}`
                                }
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                            aria-label="Toggle dark mode"
                        >
                            {isDarkMode ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                            )}
                        </button>
                        {fileName && (
                            <button
                                onClick={clearData}
                                className="bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors"
                            >
                                Upload New File
                            </button>
                        )}
                    </div>
                </header>

                {isLoading && <div className="text-center p-8 font-semibold">Loading and processing file...</div>}
                {error && <div className="text-center p-8 text-red-600 bg-red-100 rounded-lg">{error}</div>}

                {!isLoading && !fileName && (
                    <FileUploader onFileUpload={handleFileUpload} setIsLoading={setIsLoading} setError={setError} />
                )}

                {fileName && !error && logStructure.columns.length === 0 && (
                    <div className="text-center p-8 text-amber-600 bg-amber-100 rounded-lg">
                        <p className="font-semibold">No data columns detected</p>
                        <p className="text-sm mt-1">
                            The uploaded file was parsed but no columns with meaningful data were found. 
                            Please check that your JSON file contains actual data values.
                        </p>
                    </div>
                )}

                {fileName && !error && logStructure.columns.length > 0 && (
                    <>
                        {/* Timestamp Controls - only show if timestamp columns detected */}
                        {logStructure.timestampColumns.length > 0 && (
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md mb-6">
                                <h2 className="text-xl font-semibold mb-4 dark:text-gray-100">Timestamp Display</h2>
                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                                        <label className="flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={humanReadableTime}
                                                onChange={(e) => setHumanReadableTime(e.target.checked)}
                                                className="mr-2 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Convert to human readable format</span>
                                        </label>
                                        {humanReadableTime && (
                                            <div className="flex items-center gap-2">
                                                <label htmlFor="timezone-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    Timezone:
                                                </label>
                                                <select
                                                    id="timezone-select"
                                                    value={selectedTimezone}
                                                    onChange={(e) => setSelectedTimezone(e.target.value)}
                                                    className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-700 dark:text-gray-200"
                                                >
                                                    {availableTimezones.map(tz => (
                                                        <option key={tz} value={tz}>{tz}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Individual timestamp column toggles */}
                                    {humanReadableTime && logStructure.timestampColumns.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Timestamp Columns:</h3>
                                            <div className="flex flex-wrap gap-3">
                                                {logStructure.timestampColumns.map(columnKey => (
                                                    <label key={columnKey} className="flex items-center text-sm">
                                                        <input
                                                            type="checkbox"
                                                            checked={enabledTimestampColumns.has(columnKey)}
                                                            onChange={() => handleTimestampColumnToggle(columnKey)}
                                                            className="mr-2 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span className="text-gray-600 dark:text-gray-400">{getColumnDisplayName(columnKey)}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                                Uncheck columns that were incorrectly detected as timestamps
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Filter Section */}
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md mb-8">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-semibold dark:text-gray-100">Filters</h2>
                                <button
                                    onClick={clearAllFilters}
                                    className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                    Clear All Filters
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {orderedColumns.map(columnKey => (
                                     <input
                                        key={columnKey}
                                        type="text"
                                        name={columnKey}
                                        placeholder={`Filter by ${getColumnDisplayName(columnKey)}...`}
                                        value={filters[columnKey] || ''}
                                        onChange={handleFilterChange}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm bg-white dark:bg-gray-700 dark:text-gray-200"
                                    />
                                ))}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                                💡 Tip: Click on any cell value in the table below to filter by that value
                            </p>
                        </div>

                        {/* Table Section */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                            <div className="overflow-x-auto">
                                 <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-100 dark:bg-gray-700">
                                        <tr>
                                            {orderedColumns.map(columnKey => (
                                                <th 
                                                    key={columnKey} 
                                                    scope="col" 
                                                    className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 whitespace-nowrap"
                                                    onClick={() => requestSort(columnKey)}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        <span className={logStructure.timestampColumns.includes(columnKey) ? 'text-blue-600 dark:text-blue-400' : ''}>
                                                            {getColumnDisplayName(columnKey)}
                                                        </span>
                                                        <SortIcon direction={sortConfig.key === columnKey ? sortConfig.direction : null} />
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {paginatedLogs.map((log, index) => (
                                            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                                {orderedColumns.map(columnKey => {
                                                    const value = getNestedValue(log, columnKey);
                                                    const shouldFormat = shouldFormatAsTimestamp(columnKey);
                                                    
                                                    // Handle display value - be more permissive with what we consider valid
                                                    let displayValue;
                                                    if (shouldFormat) {
                                                        displayValue = formatTimestamp(value, selectedTimezone, true);
                                                    } else if (value !== undefined && value !== null) {
                                                        // Convert to string and handle edge cases
                                                        const stringValue = String(value);
                                                        displayValue = stringValue === 'undefined' || stringValue === 'null' || stringValue.trim() === '' ? 'N/A' : stringValue;
                                                    } else {
                                                        displayValue = 'N/A';
                                                    }
                                                    
                                                    // Use the original value for filtering, not the formatted display value
                                                    const filterValue = value !== undefined ? value : null;
                                                    
                                                    return (
                                                        <td key={columnKey} className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300 max-w-xs">
                                                            <div 
                                                                className="truncate cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900 hover:text-blue-700 dark:hover:text-blue-300 rounded px-1 py-0.5 transition-colors"
                                                                title={`Click to filter by: ${displayValue}`}
                                                                onClick={() => handleCellClick(columnKey, filterValue)}
                                                            >
                                                                {displayValue}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {processedLogs.length === 0 && (
                                <p className="text-center py-8 text-gray-500 dark:text-gray-400">No logs match the current filters.</p>
                            )}
                        </div>
                        
                        {/* Pagination Controls */}
                        <div className="flex items-center justify-between mt-6">
                             <div className="text-sm text-gray-600 dark:text-gray-400">
                                Showing {paginatedLogs.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}
                                - {Math.min(currentPage * itemsPerPage, processedLogs.length)} of {processedLogs.length} results
                            </div>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                                >
                                    Previous
                                </button>
                                <span className="text-sm text-gray-700 dark:text-gray-300">Page {currentPage} of {totalPages}</span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages || totalPages === 0}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

