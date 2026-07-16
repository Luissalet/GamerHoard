import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, font, radius } from '../../src/theme';
import { personDetails, tmdbImg, tvdbForTmdb, type PersonInfo, type PersonCredit } from '../../src/tmdb';
import { ShareButton } from '../../src/ShareButton';

function CreditsRow({ title, items, onOpen, busyId }: { title: string; items: PersonCredit[]; onOpen: (c: PersonCredit) => void; busyId: string | null }) {
  if (!items.length) return null;
  return (
    <View style={{ marginTop: space(5) }}>
      <Text style={[font.h2, { paddingHorizontal: space(4), marginBottom: space(3) }]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4) }}>
        {items.map((c) => {
          const key = `${c.kind}:${c.id}`;
          return (
            <Pressable key={key} style={{ width: 110 }} onPress={() => onOpen(c)}>
              <Image source={{ uri: tmdbImg(c.poster, 'w342') ?? undefined }} style={s.poster} contentFit="cover" />
              {busyId === key ? <View style={s.posterBusy}><ActivityIndicator color={colors.text} /></View> : null}
              <Text style={[font.muted, { marginTop: 4, color: colors.text }]} numberOfLines={1}>{c.title}</Text>
              {c.year ? <Text style={[font.muted, { fontSize: 11 }]}>{c.year}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function PersonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [person, setPerson] = useState<PersonInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [bioOpen, setBioOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setPerson(null); setBioOpen(false);
    personDetails(Number(id) || 0).then((p) => { if (alive) { setPerson(p); setLoading(false); } });
    return () => { alive = false; };
  }, [id]);

  const open = useCallback(async (c: PersonCredit) => {
    if (c.kind === 'movie') { router.push(`/movie/tmdb:${c.id}`); return; }
    const key = `${c.kind}:${c.id}`;
    setBusyId(key);
    const tvdb = await tvdbForTmdb(c.id);
    setBusyId(null);
    if (tvdb) router.push(`/show/${tvdb}`);
  }, [router]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const isDirector = person?.department === 'Directing';
  const meta: string[] = [];
  if (person?.birthday) meta.push(`${t('person.born')} ${person.birthday}${person.deathday ? ` · ${t('person.died')} ${person.deathday}` : ''}`);
  if (person?.placeOfBirth) meta.push(person.placeOfBirth);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space(12), paddingBottom: space(10) }}>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: space(10) }} />
        ) : !person ? (
          <Text style={[font.muted, { textAlign: 'center', marginTop: space(10), paddingHorizontal: space(4) }]}>{t('person.loadError')}</Text>
        ) : (
          <>
            <View style={{ alignItems: 'center', paddingHorizontal: space(4) }}>
              {person.profile ? (
                <Image source={{ uri: tmdbImg(person.profile, 'w342')! }} style={s.photo} contentFit="cover" />
              ) : (
                <View style={[s.photo, s.photoFallback]}><Ionicons name="person" size={48} color={colors.textMuted} /></View>
              )}
              <Text style={[font.display, { marginTop: space(3), textAlign: 'center' }]}>{person.name}</Text>
              {person.department ? <Text style={[font.muted, { marginTop: 4, color: colors.accent, fontWeight: '700' }]}>{t(isDirector ? 'person.director' : person.department === 'Acting' ? 'person.actor' : 'person.crew')}</Text> : null}
              {meta.map((m) => <Text key={m} style={[font.muted, { marginTop: 2, textAlign: 'center' }]}>{m}</Text>)}
            </View>
            {person.bio ? (
              <Pressable onPress={() => setBioOpen((v) => !v)} style={{ paddingHorizontal: space(4), marginTop: space(4) }}>
                <Text style={s.bio} numberOfLines={bioOpen ? undefined : 5}>{person.bio}</Text>
                <Text style={s.bioToggle}>{bioOpen ? t('person.less') : t('person.more')}</Text>
              </Pressable>
            ) : null}
            {isDirector ? (
              <>
                <CreditsRow title={t('person.directing')} items={person.directed} onOpen={open} busyId={busyId} />
                <CreditsRow title={t('person.acting')} items={person.actedIn} onOpen={open} busyId={busyId} />
              </>
            ) : (
              <>
                <CreditsRow title={t('person.acting')} items={person.actedIn} onOpen={open} busyId={busyId} />
                <CreditsRow title={t('person.directing')} items={person.directed} onOpen={open} busyId={busyId} />
              </>
            )}
          </>
        )}
      </ScrollView>
      <Pressable onPress={goBack} style={[s.back, { top: insets.top + space(2) }]} hitSlop={10}>
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      {person ? <ShareButton title={person.name} path={`/person/${id}`} top={insets.top + space(2)} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  back: { position: 'absolute', left: space(3), zIndex: 30, width: 40, height: 40, borderRadius: 20, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center' },
  photo: { width: 132, height: 132, borderRadius: 66, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  bio: { ...font.body, color: colors.text, lineHeight: 22 },
  bioToggle: { color: colors.accent, fontWeight: '700', marginTop: 6, fontSize: 13 },
  poster: { width: 110, height: 165, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  posterBusy: { ...StyleSheet.absoluteFillObject, height: 165, borderRadius: radius.md, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center' },
});
