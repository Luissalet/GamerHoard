import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, space, font, radius } from './theme';
import { submitReport, REPORT_REASONS, type ReportReason, type ReportTargetType } from './moderation';

// One reusable report flow (Play UGC requirement): pick a reason, optional details, submit.
// Works for users, reviews/comments and (later) activity items.
export function ReportSheet({ visible, onClose, targetType, targetProfileId, targetReviewId, targetLabel }: {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetProfileId: string;
  targetReviewId?: string | null;
  targetLabel?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => { setReason(null); setDetails(''); setErr(null); setDone(false); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const send = async () => {
    if (!reason || busy) return;
    setBusy(true); setErr(null);
    const { error } = await submitReport({ targetType, targetProfileId, targetReviewId: targetReviewId ?? null, reason, details: details.trim() || undefined });
    setBusy(false);
    if (error) setErr(/limit/i.test(error) ? t('report.errLimit') : t('report.errGeneric'));
    else setDone(true);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space(2) }}>
            <Text style={[font.h1, { fontSize: 20, flex: 1 }]}>{t(targetType === 'user' ? 'report.titleUser' : 'report.titleReview')}</Text>
            <Pressable onPress={close} hitSlop={10}><Ionicons name="close" size={24} color={colors.text} /></Pressable>
          </View>

          {done ? (
            <View style={{ alignItems: 'center', gap: space(3), paddingVertical: space(4) }}>
              <Ionicons name="checkmark-circle" size={48} color={colors.success} />
              <Text style={[font.h2, { textAlign: 'center' }]}>{t('report.thanks')}</Text>
              <Text style={[font.muted, { textAlign: 'center', lineHeight: 20 }]}>{t('report.thanksBody')}</Text>
              <Pressable style={s.primary} onPress={close}><Text style={{ color: colors.accentInk, fontWeight: '800' }}>{t('common.close')}</Text></Pressable>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              {targetLabel ? <Text style={[font.muted, { marginBottom: space(3) }]} numberOfLines={2}>{targetLabel}</Text> : null}
              <Text style={s.label}>{t('report.reasonLabel')}</Text>
              {REPORT_REASONS.map((r) => (
                <Pressable key={r} style={s.reasonRow} onPress={() => setReason(r)}>
                  <Ionicons name={reason === r ? 'radio-button-on' : 'radio-button-off'} size={20} color={reason === r ? colors.accent : colors.textMuted} />
                  <Text style={[font.body, { color: colors.text, marginLeft: space(2), flex: 1 }]}>{t('report.reason_' + r)}</Text>
                </Pressable>
              ))}
              <Text style={[s.label, { marginTop: space(3) }]}>{t('report.detailsLabel')}</Text>
              <TextInput
                value={details} onChangeText={setDetails} multiline
                placeholder={t('report.detailsPh')} placeholderTextColor={colors.textMuted}
                style={s.input}
              />
              {err ? <Text style={{ color: colors.danger, marginTop: space(2) }}>{err}</Text> : null}
              <Pressable onPress={send} disabled={!reason || busy} style={[s.primary, { alignSelf: 'stretch', marginTop: space(4), opacity: !reason || busy ? 0.5 : 1 }]}>
                {busy ? <ActivityIndicator color={colors.accentInk} size="small" /> : <Text style={{ color: colors.accentInk, fontWeight: '800' }}>{t('report.submit')}</Text>}
              </Pressable>
              <Pressable onPress={() => { close(); router.push('/guidelines'); }} style={{ marginTop: space(3), alignItems: 'center' }}>
                <Text style={[font.muted, { textDecorationLine: 'underline' }]}>{t('report.guidelinesLink')}</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000B', alignItems: 'center', justifyContent: 'center', padding: space(4) },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), width: '100%', maxWidth: 440 },
  label: { ...font.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: space(2) },
  reasonRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space(2) },
  input: { color: colors.text, fontSize: 15, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: space(3), minHeight: 64, textAlignVertical: 'top' },
  primary: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space(6), paddingVertical: space(3), alignItems: 'center', justifyContent: 'center' },
});
