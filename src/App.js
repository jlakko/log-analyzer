import React, { useState, useEffect, useMemo, useCallback } from 'react';

// Icon for sorting arrows
const SortIcon = ({ direction }) => {
    if (!direction) return <svg className="h-4 w-4 inline-block text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>;
    return direction === 'ascending' ? (
        <svg className="h-4 w-4 inline-block text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
    ) : (
        <svg className="h-4 w-4 inline-block text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
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
            className="w-full p-8 border-2 border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-blue-500 hover:bg-gray-50 transition-colors"
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
            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="mt-4 text-lg text-gray-600">
                <span className="font-semibold text-blue-600">Click to upload</span> or drag and drop
            </p>
            <p className="mt-1 text-sm text-gray-500">Newline-delimited JSON files (.json, .log)</p>
        </div>
    );
};


// Main Application Component
export default function App() {
    // --- STATE MANAGEMENT ---
    const [allLogs, setAllLogs] = useState([]);
    const [fileName, setFileName] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // State for filtering
    const [filters, setFilters] = useState({
        uid: '',
        'id.orig_h': '',
        'id.orig_p': '',
        'id.resp_h': '',
        'id.resp_p': '',
        proto: '',
        service: '',
        conn_state: '',
    });

    // State for sorting
    const [sortConfig, setSortConfig] = useState({ key: 'ts', direction: 'descending' });
    
    // State for pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    
    // Memoized filtered and sorted logs
    const processedLogs = useMemo(() => {
        let logs = [...allLogs];

        // Apply filters
        logs = logs.filter(log => {
            return Object.keys(filters).every(key => {
                const filterValue = filters[key].toLowerCase();
                if (!filterValue) return true;
                const logValue = log[key] ? String(log[key]).toLowerCase() : '';
                return logValue.includes(filterValue);
            });
        });

        // Apply sorting
        if (sortConfig.key) {
            logs.sort((a, b) => {
                const aValue = a[sortConfig.key] || '';
                const bValue = b[sortConfig.key] || '';

                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
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

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };
    
    const clearData = () => {
        setAllLogs([]);
        setFileName(null);
        setError(null);
        setFilters({
            uid: '', 'id.orig_h': '', 'id.orig_p': '', 'id.resp_h': '', 'id.resp_p': '',
            proto: '', service: '', conn_state: '',
        });
    };

    // --- PAGINATION LOGIC ---
    const paginatedLogs = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return processedLogs.slice(startIndex, startIndex + itemsPerPage);
    }, [processedLogs, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(processedLogs.length / itemsPerPage);

    // --- RENDER ---
    const headers = [
        { key: 'ts', label: 'Timestamp' },
        { key: 'uid', label: 'UID' },
        { key: 'id.orig_h', label: 'Source IP' },
        { key: 'id.orig_p', label: 'Source Port' },
        { key: 'id.resp_h', label: 'Dest IP' },
        { key: 'id.resp_p', label: 'Dest Port' },
        { key: 'proto', label: 'Protocol' },
        { key: 'service', label: 'Service' },
        { key: 'duration', label: 'Duration (s)' },
        { key: 'orig_bytes', label: 'Orig Bytes' },
        { key: 'resp_bytes', label: 'Resp Bytes' },
        { key: 'conn_state', label: 'State' },
    ];

    return (
        <div className="bg-gray-50 min-h-screen font-sans text-gray-800">
            <div className="container mx-auto p-4 sm:p-6 lg:p-8">
                <header className="mb-8 flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Connection Log Analyzer</h1>
                        <p className="text-gray-600 mt-1">
                            {fileName ? `Analyzing: ${fileName}` : "Upload a log file to begin."}
                        </p>
                    </div>
                    {fileName && (
                        <button
                            onClick={clearData}
                            className="bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 transition-colors"
                        >
                            Upload New File
                        </button>
                    )}
                </header>

                {isLoading && <div className="text-center p-8 font-semibold">Loading and processing file...</div>}
                {error && <div className="text-center p-8 text-red-600 bg-red-100 rounded-lg">{error}</div>}

                {!isLoading && !fileName && (
                    <FileUploader onFileUpload={handleFileUpload} setIsLoading={setIsLoading} setError={setError} />
                )}

                {fileName && !error && (
                    <>
                        {/* Filter Section */}
                        <div className="bg-white p-4 rounded-lg shadow-md mb-8">
                            <h2 className="text-xl font-semibold mb-4">Filters</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {Object.keys(filters).map(key => (
                                     <input
                                        key={key}
                                        type="text"
                                        name={key}
                                        placeholder={`Filter by ${key}...`}
                                        value={filters[key]}
                                        onChange={handleFilterChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Table Section */}
                        <div className="bg-white rounded-lg shadow-md overflow-hidden">
                            <div className="overflow-x-auto">
                                 <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            {headers.map(header => (
                                                <th 
                                                    key={header.key} 
                                                    scope="col" 
                                                    className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                                                    onClick={() => requestSort(header.key)}
                                                >
                                                    {header.label}
                                                    <SortIcon direction={sortConfig.key === header.key ? sortConfig.direction : null} />
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {paginatedLogs.map((log) => (
                                            <tr key={log.uid} className="hover:bg-gray-50">
                                                {headers.map(header => (
                                                    <td key={header.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                        {log[header.key] !== undefined ? String(log[header.key]) : 'N/A'}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {processedLogs.length === 0 && (
                                <p className="text-center py-8 text-gray-500">No logs match the current filters.</p>
                            )}
                        </div>
                        
                        {/* Pagination Controls */}
                        <div className="flex items-center justify-between mt-6">
                             <div className="text-sm text-gray-600">
                                Showing {paginatedLogs.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}
                                - {Math.min(currentPage * itemsPerPage, processedLogs.length)} of {processedLogs.length} results
                            </div>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Previous
                                </button>
                                <span className="text-sm text-gray-700">Page {currentPage} of {totalPages}</span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages || totalPages === 0}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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

