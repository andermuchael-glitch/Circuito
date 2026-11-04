package app.circuito;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String START = "https://andermuchael-glitch.github.io/Circuito/";
    private WebView web;
    private int insetTop;
    private int insetBottom;
    private boolean receiverRegistered = false;

    private final BroadcastReceiver locationReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (web == null || intent == null) return;
            JSONObject point = new JSONObject();
            try {
                point.put("latitude", intent.getDoubleExtra("latitude", 0));
                point.put("longitude", intent.getDoubleExtra("longitude", 0));
                point.put("accuracy", intent.getFloatExtra("accuracy", 0));
                point.put("speed", intent.getFloatExtra("speed", 0));
                point.put("time", intent.getLongExtra("time", System.currentTimeMillis()));
                web.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('circuito-native-location',{detail:" + point.toString() + "}))",
                    null
                );
            } catch (Exception ignored) {}
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestLocationPermissions();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#07110c"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#07110c"));
        root.addView(web, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                insetTop = bars.top;
                insetBottom = bars.bottom;
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                markNativeInsets();
                return WindowInsets.CONSUMED;
            });
        } else {
            root.setFitsSystemWindows(true);
        }
        setContentView(root);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                markNativeInsets();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });
        web.addJavascriptInterface(new ScreenBridge(), "Circuito");
        web.loadUrl(START);
        registerLocationReceiver();
    }

    private void requestLocationPermissions() {
        java.util.ArrayList<String> permissions = new java.util.ArrayList<>();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED)
            permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!permissions.isEmpty()) requestPermissions(permissions.toArray(new String[0]), 1);
    }

    private void registerLocationReceiver() {
        if (receiverRegistered) return;
        IntentFilter filter = new IntentFilter(LocationForegroundService.ACTION_LOCATION);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(locationReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(locationReceiver, filter);
        receiverRegistered = true;
    }

    private void markNativeInsets() {
        if (web == null || (insetTop == 0 && insetBottom == 0)) return;
        web.evaluateJavascript("document.documentElement.classList.add('native-insets')", null);
    }

    private final class ScreenBridge {
        @JavascriptInterface
        public void stayOn(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void startLocationTracking() {
            runOnUiThread(() -> {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                    checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    requestLocationPermissions();
                    return;
                }
                Intent service = new Intent(MainActivity.this, LocationForegroundService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(service);
                else startService(service);
            });
        }

        @JavascriptInterface
        public void stopLocationTracking() {
            stopService(new Intent(MainActivity.this, LocationForegroundService.class));
        }

        @JavascriptInterface
        public String consumeLocationPoints() {
            String points = getSharedPreferences("circuito_gps", MODE_PRIVATE)
                .getString("pending_points", "[]");
            getSharedPreferences("circuito_gps", MODE_PRIVATE).edit()
                .putString("pending_points", "[]").apply();
            return points == null ? "[]" : points;
        }
    }

    @Override
    protected void onDestroy() {
        if (receiverRegistered) {
            unregisterReceiver(locationReceiver);
            receiverRegistered = false;
        }
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }
}
