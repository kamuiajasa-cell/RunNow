import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { useTabBarInset } from '@/components/tabBarInset';
import { RUNNOW_HTML } from '@/features/runnow/runnowHtml';
import { useTheme } from '@/theme';

export default function RunNowScreen() {
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: tabBarInset }}>
      <WebView
        style={{ flex: 1, backgroundColor: colors.background }}
        originWhitelist={['*']}
        source={{ html: RUNNOW_HTML, baseUrl: 'https://runnow.local/' }}
        javaScriptEnabled
        domStorageEnabled
        onError={(e) => console.warn('RunNow WebView error', e.nativeEvent)}
        onHttpError={(e) => console.warn('RunNow WebView HTTP', e.nativeEvent.statusCode, e.nativeEvent.url)}
      />
    </View>
  );
}
