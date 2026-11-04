package app.circuito;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;

public class LocationForegroundService extends Service {
    public static final String ACTION_LOCATION = "app.circuito.ACTION_LOCATION";
    private static final String CHANNEL_ID = "circuito_location";
    private static final int NOTIFICATION_ID = 365;
    private LocationManager locationManager;
    private final LocationListener listener = new LocationListener() {
        @Override public void onLocationChanged(Location location) { publishLocation(location); }
        @Override public void onProviderEnabled(String provider) {}
        @Override public void onProviderDisabled(String provider) {}
        @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!hasLocationPermission()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        try {
            if (locationManager != null) {
                if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2500L, 2f, listener, Looper.getMainLooper());
                }
                if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000L, 5f, listener, Looper.getMainLooper());
                }
                Location last = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                if (last != null) publishLocation(last);
            }
        } catch (SecurityException ignored) {
            stopSelf();
        }
        return START_STICKY;
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        return builder
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Circuito · GPS ativo")
            .setContentText("Registrando os quilômetros da sua corrida")
            .setContentIntent(pending)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Rastreamento da corrida", NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Mantém o registro de quilômetros durante a navegação");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void publishLocation(Location location) {
        if (location == null || !Double.isFinite(location.getLatitude()) || !Double.isFinite(location.getLongitude())) return;
        long time = location.getTime() > 0 ? location.getTime() : System.currentTimeMillis();
        float accuracy = location.hasAccuracy() ? location.getAccuracy() : 0f;
        float speed = location.hasSpeed() ? location.getSpeed() : 0f;

        JSONObject point = new JSONObject();
        try {
            point.put("latitude", location.getLatitude());
            point.put("longitude", location.getLongitude());
            point.put("accuracy", accuracy);
            point.put("speed", speed);
            point.put("time", time);
            savePendingPoint(point);
        } catch (Exception ignored) {}

        Intent broadcast = new Intent(ACTION_LOCATION);
        broadcast.setPackage(getPackageName());
        broadcast.putExtra("latitude", location.getLatitude());
        broadcast.putExtra("longitude", location.getLongitude());
        broadcast.putExtra("accuracy", accuracy);
        broadcast.putExtra("speed", speed);
        broadcast.putExtra("time", time);
        sendBroadcast(broadcast);
    }

    private void savePendingPoint(JSONObject point) {
        synchronized (LocationForegroundService.class) {
            try {
                android.content.SharedPreferences prefs = getSharedPreferences("circuito_gps", MODE_PRIVATE);
                JSONArray points = new JSONArray(prefs.getString("pending_points", "[]"));
                points.put(point);
                JSONArray trimmed = new JSONArray();
                int start = Math.max(0, points.length() - 1800);
                for (int i = start; i < points.length(); i++) trimmed.put(points.getJSONObject(i));
                prefs.edit().putString("pending_points", trimmed.toString()).apply();
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onDestroy() {
        if (locationManager != null) {
            try { locationManager.removeUpdates(listener); } catch (SecurityException ignored) {}
        }
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
