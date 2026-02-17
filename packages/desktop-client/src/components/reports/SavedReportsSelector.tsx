import { useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgTrash } from '@actual-app/components/icons/v1';
import { SvgDownloadThickBottom } from '@actual-app/components/icons/v2';
import { Input } from '@actual-app/components/input';
import { Popover } from '@actual-app/components/popover';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import {
  useSavedReports,
  type SavedReport,
  type SavedReportConfig,
} from '@desktop-client/hooks/useSavedReports';

type SavedReportsSelectorProps = {
  reportType: string;
  currentConfig: SavedReportConfig;
  onLoadReport: (config: SavedReportConfig) => void;
  onSaved?: (report: SavedReport) => void;
};

export function SavedReportsSelector({
  reportType,
  currentConfig,
  onLoadReport,
  onSaved,
}: SavedReportsSelectorProps) {
  const { t } = useTranslation();
  const {
    savedReports,
    selectedReportId,
    saveReport,
    deleteReport,
    selectReport,
    getReport,
  } = useSavedReports(reportType);

  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [newReportName, setNewReportName] = useState('');
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  const handleSaveReport = () => {
    if (!newReportName.trim()) return;

    const saved = saveReport(newReportName.trim(), currentConfig);
    setNewReportName('');
    setSaveMenuOpen(false);
    onSaved?.(saved);
  };

  const handleLoadReport = (id: string) => {
    const report = getReport(id);
    if (report) {
      selectReport(id);
      onLoadReport(report.config);
    }
  };

  const handleDeleteReport = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteReport(id);
  };

  const handleClearSelection = () => {
    selectReport(null);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {/* Saved Reports Dropdown */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Text style={{ whiteSpace: 'nowrap', color: theme.pageTextLight }}>
          <Trans>Saved reports:</Trans>
        </Text>
        <Select
          value={selectedReportId || ''}
          onChange={(value: string) => {
            if (value) {
              handleLoadReport(value);
            } else {
              handleClearSelection();
            }
          }}
          options={[
            ['', t('-- Select --')],
            ...savedReports.map(report => [report.id, report.name] as const),
          ]}
          style={{ minWidth: 150 }}
        />
      </View>

      {/* Delete button for selected report */}
      {selectedReportId && (
        <Button
          variant="bare"
          aria-label={t('Delete saved report')}
          onPress={() => deleteReport(selectedReportId)}
          style={{ color: theme.errorText }}
        >
          <SvgTrash width={15} height={15} />
        </Button>
      )}

      {/* Save button */}
      <Button
        ref={saveButtonRef}
        variant="normal"
        onPress={() => setSaveMenuOpen(true)}
      >
        <SvgDownloadThickBottom
          width={13}
          height={13}
          style={{ marginRight: 5 }}
        />
        <Trans>Save</Trans>
      </Button>

      {/* Save popover */}
      <Popover
        triggerRef={saveButtonRef}
        isOpen={saveMenuOpen}
        onOpenChange={() => setSaveMenuOpen(false)}
        style={{ padding: 15, width: 250 }}
      >
        <View style={{ gap: 10 }}>
          <Text style={{ fontWeight: 600 }}>
            <Trans>Save current settings</Trans>
          </Text>
          <Input
            placeholder={t('Report name')}
            value={newReportName}
            onChange={e => setNewReportName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleSaveReport();
              }
            }}
            autoFocus
          />
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              justifyContent: 'flex-end',
            }}
          >
            <Button variant="normal" onPress={() => setSaveMenuOpen(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="primary"
              onPress={handleSaveReport}
              isDisabled={!newReportName.trim()}
            >
              <Trans>Save</Trans>
            </Button>
          </View>
        </View>
      </Popover>
    </View>
  );
}
