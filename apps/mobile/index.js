// Entry local para monorepo: evita que `expo export:embed` calcule mal la
// ruta a expo-router/entry (node_modules hoisteados en la raíz del workspace).
import 'expo-router/entry';
