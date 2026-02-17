import { useCallback, useEffect, useState } from 'react';

import {
  type RuleConditionEntity,
  type TimeFrame,
} from 'loot-core/types/models';

// Generic config that supports all report types
export type SavedReportConfig = {
  // Current Asset Value
  date?: string;
  // Budget vs Actual
  start?: string;
  end?: string;
  mode?: TimeFrame['mode'];
  showHiddenCategories?: boolean;
  showIncomeCategories?: boolean;
  // Shared
  conditions?: RuleConditionEntity[];
  conditionsOp?: 'and' | 'or';
};

export type SavedReport = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  config: SavedReportConfig;
};

type SavedReportsMap = Record<string, SavedReport[]>;

const STORAGE_KEY = 'actual-saved-reports';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function loadFromStorage(): SavedReportsMap {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveToStorage(data: SavedReportsMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function useSavedReports(reportType: string) {
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Load saved reports on mount
  useEffect(() => {
    const allReports = loadFromStorage();
    setSavedReports(allReports[reportType] || []);
  }, [reportType]);

  const saveReport = useCallback(
    (name: string, config: SavedReport['config']): SavedReport => {
      const now = new Date().toISOString();
      const newReport: SavedReport = {
        id: generateId(),
        name,
        createdAt: now,
        updatedAt: now,
        config,
      };

      const allReports = loadFromStorage();
      const reportList = allReports[reportType] || [];
      const updatedList = [...reportList, newReport];

      allReports[reportType] = updatedList;
      saveToStorage(allReports);
      setSavedReports(updatedList);
      setSelectedReportId(newReport.id);

      return newReport;
    },
    [reportType],
  );

  const updateReport = useCallback(
    (id: string, name: string, config: SavedReport['config']): void => {
      const allReports = loadFromStorage();
      const reportList = allReports[reportType] || [];

      const updatedList = reportList.map(report =>
        report.id === id
          ? { ...report, name, config, updatedAt: new Date().toISOString() }
          : report,
      );

      allReports[reportType] = updatedList;
      saveToStorage(allReports);
      setSavedReports(updatedList);
    },
    [reportType],
  );

  const deleteReport = useCallback(
    (id: string): void => {
      const allReports = loadFromStorage();
      const reportList = allReports[reportType] || [];

      const updatedList = reportList.filter(report => report.id !== id);

      allReports[reportType] = updatedList;
      saveToStorage(allReports);
      setSavedReports(updatedList);

      if (selectedReportId === id) {
        setSelectedReportId(null);
      }
    },
    [reportType, selectedReportId],
  );

  const getReport = useCallback(
    (id: string): SavedReport | undefined => {
      return savedReports.find(report => report.id === id);
    },
    [savedReports],
  );

  const selectReport = useCallback((id: string | null) => {
    setSelectedReportId(id);
  }, []);

  const selectedReport = selectedReportId ? getReport(selectedReportId) : null;

  return {
    savedReports,
    selectedReport,
    selectedReportId,
    saveReport,
    updateReport,
    deleteReport,
    getReport,
    selectReport,
  };
}
