import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { checkAWSStatus, syncAWSData } from '../services/analysisApi';

export default function AWSSyncModal({ isOpen, onClose, onSuccess, theme = 'light' }) {
  const [region, setRegion] = useState('us-east-1');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSync = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setStatusMsg('Checking Credentials...');

    const credentials = {
        awsAccessKeyId: accessKey || undefined,
        awsSecretAccessKey: secretKey || undefined,
        region: region
    };

    try {
        await checkAWSStatus(credentials);
        setStatusMsg('Discovering Infrastructure...');
        
        const result = await syncAWSData(credentials);
        setStatusMsg(`Synced ${result.nodes_synced} resources safely!`);
        
        // Let user read success quickly before closing
        setTimeout(() => {
            onSuccess();
            onClose();
        }, 1500);

    } catch (err) {
        setErrorMessage(err.message || 'Failed to sync with AWS');
        setIsLoading(false);
        setStatusMsg('');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/10 dark:bg-black/20 backdrop-blur-md ${theme === 'dark' ? 'dark' : ''}`}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="w-full max-w-md p-6 bg-white/70 border border-white/50 shadow-2xl rounded-2xl backdrop-blur-xl dark:bg-gray-900/70 dark:border-gray-800/50"
          >
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-amber-500">
                    Connect AWS Account
                </h2>
                <button
                    onClick={onClose}
                    disabled={isLoading}
                    className="p-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors rounded-full hover:bg-gray-200/50 dark:hover:bg-gray-700/50"
                    aria-label="Close modal"
                >
                    ✕
                </button>
            </div>

            <p className="mb-6 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                Provide read-only credentials to instantly map your real infrastructure onto the canvas. To use environment defaults, leave keys blank.
            </p>

            <form onSubmit={handleSync} className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">AWS Region</label>
                    <input
                        type="text"
                        required
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        disabled={isLoading}
                        className="w-full px-4 py-2 bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                        placeholder="us-east-1"
                    />
                </div>
                
                <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">Access Key ID</label>
                    <input
                        type="text"
                        value={accessKey}
                        onChange={(e) => setAccessKey(e.target.value)}
                        disabled={isLoading}
                        className="w-full px-4 py-2 bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                        placeholder="AKIAIOSFODNN7EXAMPLE"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">Secret Access Key</label>
                    <input
                        type="password"
                        value={secretKey}
                        onChange={(e) => setSecretKey(e.target.value)}
                        disabled={isLoading}
                        className="w-full px-4 py-2 bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                        placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    />
                </div>

                {errorMessage && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-900/50">
                        {errorMessage}
                    </div>
                )}
                
                {statusMsg && !errorMessage && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-sm rounded-lg flex items-center justify-center space-x-2">
                        {isLoading && (
                            <svg className="animate-spin h-4 w-4 text-green-600 dark:text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        <span>{statusMsg}</span>
                    </div>
                )}

                <div className="pt-4 flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-6 py-2 font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg hover:shadow-lg hover:shadow-orange-500/25 transition-all disabled:opacity-50"
                    >
                        Connect & Sync
                    </button>
                </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
