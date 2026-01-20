import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import {
  Modal,
  ModalCloseButton,
  ModalHeader,
} from '@desktop-client/components/common/Modal';
import { type Modal as ModalType } from '@desktop-client/modals/modalsSlice';

type ImportSummaryModalProps = Extract<
  ModalType,
  { name: 'import-summary' }
>['options'];

export function ImportSummaryModal({
  importType,
  accountsUsed,
  accountsCreated,
  transactionsAdded,
  transactionsUpdated,
  categoriesApplied,
  errors,
}: ImportSummaryModalProps) {
  const { t } = useTranslation();

  const hasErrors = errors.length > 0;
  const title = importType === 'migros' ? t('Migros Import Summary') : t('Revolut Import Summary');

  return (
    <Modal name="import-summary" containerProps={{ style: { width: 450 } }}>
      {({ state: { close } }) => (
        <>
          <ModalHeader
            title={title}
            rightContent={<ModalCloseButton onPress={close} />}
          />
          <View style={{ lineHeight: 1.6, gap: 15 }}>
            {/* Success/Error indicator */}
            <View
              style={{
                padding: 10,
                borderRadius: 4,
                backgroundColor: hasErrors ? theme.errorBackground : theme.noticeBackground,
              }}
            >
              <Text style={{ fontWeight: 'bold', color: hasErrors ? theme.errorText : theme.noticeText }}>
                {hasErrors ? (
                  <Trans>Import completed with errors</Trans>
                ) : (
                  <Trans>Import completed successfully</Trans>
                )}
              </Text>
            </View>

            {/* Accounts */}
            <View>
              <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>
                <Trans>Accounts</Trans>
              </Text>
              {accountsUsed.length > 0 && (
                <Text style={{ color: theme.pageTextSubdued }}>
                  <Trans>Used:</Trans> {accountsUsed.join(', ')}
                </Text>
              )}
              {accountsCreated.length > 0 && (
                <Text style={{ color: theme.noticeText }}>
                  <Trans>Created:</Trans> {accountsCreated.join(', ')}
                </Text>
              )}
            </View>

            {/* Transactions */}
            <View>
              <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>
                <Trans>Transactions</Trans>
              </Text>
              <View style={{ display: 'flex', flexDirection: 'row', gap: 20 }}>
                <View style={{ textAlign: 'center' }}>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.noticeText }}>
                    {transactionsAdded}
                  </Text>
                  <Text style={{ color: theme.pageTextSubdued, fontSize: '0.9em' }}>
                    <Trans>Added</Trans>
                  </Text>
                </View>
                <View style={{ textAlign: 'center' }}>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.warningText }}>
                    {transactionsUpdated}
                  </Text>
                  <Text style={{ color: theme.pageTextSubdued, fontSize: '0.9em' }}>
                    <Trans>Updated</Trans>
                  </Text>
                </View>
                {categoriesApplied > 0 && (
                  <View style={{ textAlign: 'center' }}>
                    <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.pageTextPositive }}>
                      {categoriesApplied}
                    </Text>
                    <Text style={{ color: theme.pageTextSubdued, fontSize: '0.9em' }}>
                      <Trans>Categorized</Trans>
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Errors */}
            {hasErrors && (
              <View>
                <Text style={{ fontWeight: 'bold', marginBottom: 5, color: theme.errorText }}>
                  <Trans>Errors</Trans>
                </Text>
                {errors.map((error, i) => (
                  <Text key={i} style={{ color: theme.errorText }}>
                    {error}
                  </Text>
                ))}
              </View>
            )}

            {/* Close button */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                marginTop: 10,
              }}
            >
              <InitialFocus>
                <Button variant="primary" onPress={close}>
                  <Trans>Close</Trans>
                </Button>
              </InitialFocus>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
