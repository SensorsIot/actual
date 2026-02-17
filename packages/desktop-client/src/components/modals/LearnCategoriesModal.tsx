import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { Paragraph } from '@actual-app/components/paragraph';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/fetch';

import {
  Modal,
  ModalCloseButton,
  ModalHeader,
} from '@desktop-client/components/common/Modal';
import { type Modal as ModalType } from '@desktop-client/modals/modalsSlice';

type LearnCategoriesModalProps = Extract<
  ModalType,
  { name: 'learn-categories' }
>['options'];

export function LearnCategoriesModal({
  onLearn,
  onSkip,
}: LearnCategoriesModalProps) {
  const { t } = useTranslation();
  const [isLearning, setIsLearning] = useState(false);
  const [learnedCount, setLearnedCount] = useState<number | null>(null);

  async function handleLearn(close: () => void) {
    setIsLearning(true);
    let count = 0;
    try {
      const result = await send('swiss-bank-learn-categories', {});
      if (result && result.mapping && result.count > 0) {
        // Save the learned mapping to the file
        await send('swiss-bank-save-payee-mapping', {
          mapping: result.mapping,
        });
        count = result.count;
        setLearnedCount(count);
        console.log(`Learned and saved ${count} payee-category mappings`);
      } else {
        // No categorized transactions found - don't save anything, user can try again later
        setLearnedCount(0);
        console.log('No categorized transactions found to learn from');
      }
    } catch (err) {
      console.error('Failed to learn categories:', err);
      setLearnedCount(0);
    }
    setIsLearning(false);

    // Brief delay to show the result, then close and call callback
    setTimeout(
      () => {
        close();
        onLearn?.();
      },
      count > 0 ? 1000 : 100,
    );
  }

  async function handleSkip(close: () => void) {
    // Save a marker so the modal doesn't appear again
    // Using a special key that won't conflict with real payee names
    try {
      await send('swiss-bank-save-payee-mapping', {
        mapping: { _skip_learn: { expense: 'skipped' } },
      });
      console.log('Skipped learning, saved marker');
    } catch (err) {
      console.error('Failed to save skip marker:', err);
    }
    close();
    onSkip?.();
  }

  return (
    <Modal name="learn-categories" containerProps={{ style: { width: 450 } }}>
      {({ state: { close } }) => (
        <>
          <ModalHeader
            title={t('Learn Categories')}
            rightContent={
              <ModalCloseButton onPress={() => handleSkip(close)} />
            }
          />
          <View style={{ padding: '0 15px 15px 15px' }}>
            {learnedCount === null ? (
              <>
                <Paragraph style={{ marginBottom: 15 }}>
                  <Trans>
                    No category mappings found for automatic categorization.
                  </Trans>
                </Paragraph>
                <Paragraph style={{ marginBottom: 20 }}>
                  <Trans>
                    Would you like to learn payee-category associations from
                    your existing categorized transactions? This will help
                    auto-fill categories for future imports.
                  </Trans>
                </Paragraph>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                    gap: 10,
                  }}
                >
                  <Button
                    onPress={() => handleSkip(close)}
                    isDisabled={isLearning}
                  >
                    <Trans>Skip</Trans>
                  </Button>
                  <ButtonWithLoading
                    variant="primary"
                    isLoading={isLearning}
                    onPress={() => handleLearn(close)}
                  >
                    <Trans>Learn Categories</Trans>
                  </ButtonWithLoading>
                </View>
              </>
            ) : (
              <View style={{ textAlign: 'center', padding: 20 }}>
                <Text
                  style={{
                    fontSize: 16,
                    color:
                      learnedCount > 0
                        ? theme.noticeTextLight
                        : theme.pageTextSubdued,
                  }}
                >
                  {learnedCount > 0 ? (
                    <Trans>
                      Learned {{ count: learnedCount }} category mappings!
                    </Trans>
                  ) : (
                    <Trans>
                      No categorized transactions found to learn from.
                    </Trans>
                  )}
                </Text>
              </View>
            )}
          </View>
        </>
      )}
    </Modal>
  );
}
