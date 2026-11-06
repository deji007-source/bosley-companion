#!/usr/bin/env python3
"""Install Bosley's native Android always-on-top floating bar into a generated Capacitor project."""
from pathlib import Path
import re

root = Path("android")
manifest = root / "app/src/main/AndroidManifest.xml"
if not manifest.exists():
    raise SystemExit("Generated AndroidManifest.xml not found")
text = manifest.read_text()
if "android.permission.RECORD_AUDIO" not in text:
    text = text.replace("<application", '<uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <application', 1)
for permission in ("android.permission.MODIFY_AUDIO_SETTINGS", "android.permission.FOREGROUND_SERVICE", "android.permission.FOREGROUND_SERVICE_SPECIAL_USE", "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION", "android.permission.POST_NOTIFICATIONS"):
    if permission not in text:
        text = text.replace("<application", f'<uses-permission android:name="{permission}" />\n    <application', 1)
if "SYSTEM_ALERT_WINDOW" not in text:
    text = text.replace("<manifest ", '<manifest xmlns:tools="http://schemas.android.com/tools" ', 1) if 'xmlns:tools=' not in text else text
    text = text.replace("<application", '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />\n    <application', 1)
if "BosleyOverlayService" not in text:
    text = text.replace("</application>", '        <service android:name=".BosleyOverlayService" android:exported="false" android:stopWithTask="false" android:foregroundServiceType="specialUse|mediaProjection"><property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="User-enabled floating Bosley companion and visual guide" /></service>\n    </application>')
else:
    text = re.sub(r'<service([^>]*android:name="\.BosleyOverlayService"[^>]*)/>', r'<service\1 android:stopWithTask="false" android:foregroundServiceType="specialUse|mediaProjection"><property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="User-enabled floating Bosley companion, visual guide and screen capture" /></service>', text)
# Bosley text sharing intent filters: users explicitly choose Bosley from Android's
# Share or Process Text menu. The app receives only the selected/shared text.
if "Bosley text sharing intent filters" not in text:
    main_activity = re.search(r'<activity\b(?=[^>]*android:name="[^"]*MainActivity")[^>]*>[\s\S]*?</activity>', text)
    if not main_activity:
        raise SystemExit("MainActivity manifest entry not found; cannot safely register text sharing")
    activity_block = main_activity.group(0)
    share_filters = """
            <intent-filter android:label="Bosley">
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
            <intent-filter android:label="Bosley">
                <action android:name="android.intent.action.PROCESS_TEXT" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>"""
    activity_block = activity_block.replace("</activity>", share_filters + "\n        </activity>")
    text = text[:main_activity.start()] + activity_block + text[main_activity.end():]
    text = text.replace("<application", '<application', 1)
manifest.write_text(text)
accessibility_service = '''        <service android:name=".BosleyTargetAccessibilityService" android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE" android:exported="true" android:label="@string/bosley_accessibility_label"><intent-filter><action android:name="android.accessibilityservice.AccessibilityService" /></intent-filter><meta-data android:name="android.accessibilityservice" android:resource="@xml/bosley_accessibility_service" /></service>'''
if "BosleyTargetAccessibilityService" not in text:
    text = text.replace("</application>", accessibility_service + "\n    </application>")
ime_service = '''        <service android:name=".BosleyKeyboardService" android:label="Bosley Keyboard" android:permission="android.permission.BIND_INPUT_METHOD" android:exported="true">
            <intent-filter><action android:name="android.view.InputMethod" /></intent-filter>
            <meta-data android:name="android.view.im" android:resource="@xml/bosley_input_method" />
        </service>'''
if "BosleyKeyboardService" not in text:
    text = text.replace("</application>", ime_service + "\n    </application>")
manifest.write_text(text)

# The guide target finder is explicitly user-enabled in Android Accessibility settings.
# It inspects visible control labels and bounds only after the user taps Find target.
res = root / "app/src/main/res"
(res / "xml").mkdir(parents=True, exist_ok=True)
(res / "values").mkdir(parents=True, exist_ok=True)
(res / "xml/bosley_input_method.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<input-method xmlns:android="http://schemas.android.com/apk/res/android">
    <subtype android:label="English" android:imeSubtypeLocale="en" android:imeSubtypeMode="keyboard" />
</input-method>
""")

(res / "xml/bosley_accessibility_service.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowsChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagRetrieveInteractiveWindows|flagReportViewIds"
    android:canRetrieveWindowContent="true"
    android:notificationTimeout="100"
    android:description="@string/bosley_accessibility_description" />
""")
(res / "values/bosley_accessibility_strings.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="bosley_accessibility_label">Bosley visual guide</string>
    <string name="bosley_accessibility_description">When you tap Find target in the Bosley guide, reads visible control labels and screen positions to point out the relevant button or field. It does not record your screen, click, type, or run actions.</string>
</resources>
""")

src = root / "app/src/main/java/com/bosley/companion"
src.mkdir(parents=True, exist_ok=True)
(src / "BosleyOverlayService.java").write_text(r'''package com.bosley.companion;
import android.app.*;
import android.content.*;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import android.graphics.PixelFormat;
import android.util.DisplayMetrics;

public class BosleyOverlayService extends Service {
  static final String ACTION_BULB_SHOW="com.bosley.companion.BULB_SHOW", ACTION_BULB_ACTIVE="com.bosley.companion.BULB_ACTIVE", ACTION_BULB_IDLE="com.bosley.companion.BULB_IDLE", ACTION_BULB_HIDE="com.bosley.companion.BULB_HIDE";
  static final String ACTION_CAPTURE_PROMPT="com.bosley.companion.CAPTURE_PROMPT", ACTION_SHOW="com.bosley.companion.SHOW_OVERLAY", ACTION_HIDE="com.bosley.companion.HIDE_OVERLAY", ACTION_STYLE="com.bosley.companion.STYLE_OVERLAY", ACTION_GUIDE="com.bosley.companion.SHOW_GUIDE", ACTION_HIDE_GUIDE="com.bosley.companion.HIDE_GUIDE", ACTION_TARGET="com.bosley.companion.GUIDE_TARGET_UPDATE", ACTION_CAPTURE_START="com.bosley.companion.CAPTURE_START", ACTION_CAPTURE_STOP="com.bosley.companion.CAPTURE_STOP";
  int widgetWidth=44,widgetHeight=44,cornerDp=18,borderDp=1,eyeWidth=9,eyeHeight=17,eyeGapDp=8; String eyeShape="soft-square";
  WindowManager wm; View bar,bulb,capturePrompt; WindowManager.LayoutParams capturePromptLp; Handler bulbHandler=new Handler(Looper.getMainLooper()); boolean bulbInUse=false; Runnable hideBulbTask=()->{if(!bulbInUse)hideBulb();}; WindowManager.LayoutParams lp,bulbLp; View guideLine,guideCard,guideTarget; WindowManager.LayoutParams guideLineLp,guideCardLp,guideTargetLp; String guideInstruction="Follow the tether to the next step."; String guideTargetLabel="Target not searched yet"; TextView guideStatusView; float guideTargetX=.55f,guideTargetY=.55f;
  static final String CHANNEL_ID="bosley_floating_companion";
  void promoteToForeground(){
    if(Build.VERSION.SDK_INT>=26){
      NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
      if(manager!=null)manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID,"Bosley floating companion",NotificationManager.IMPORTANCE_LOW));
    }
    Intent open=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent pending=PendingIntent.getActivity(this,701,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL_ID):new Notification.Builder(this);
    Notification notification=builder
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle("Bosley floating companion is active")
      .setContentText("The floating widget can stay visible while you use other apps.")
      .setContentIntent(pending).setOngoing(true).setCategory(Notification.CATEGORY_SERVICE).build();
    if(Build.VERSION.SDK_INT>=34)startForeground(701,notification,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
    else startForeground(701,notification);
  }
  void promoteToCaptureForeground(){
    if(Build.VERSION.SDK_INT<34)return;
    NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
    if(manager!=null)manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID,"Bosley floating companion",NotificationManager.IMPORTANCE_LOW));
    Intent open=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent pending=PendingIntent.getActivity(this,701,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    Notification notification=new Notification.Builder(this,CHANNEL_ID).setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle("Bosley is capturing your screen").setContentText("One-time screen capture requested by you.")
      .setContentIntent(pending).setOngoing(true).setCategory(Notification.CATEGORY_SERVICE).build();
    startForeground(701,notification,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE|android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
  }
  void stopCaptureForeground(){
    if(Build.VERSION.SDK_INT>=34){
      NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
      if(manager!=null)manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID,"Bosley floating companion",NotificationManager.IMPORTANCE_LOW));
      Intent open=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
      PendingIntent pending=PendingIntent.getActivity(this,701,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
      Notification notification=new Notification.Builder(this,CHANNEL_ID).setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle("Bosley floating companion is active").setContentText("The floating widget can stay visible while you use other apps.")
        .setContentIntent(pending).setOngoing(true).setCategory(Notification.CATEGORY_SERVICE).build();
      startForeground(701,notification,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
    }
  }
  @Override public void onCreate(){super.onCreate();wm=(WindowManager)getSystemService(WINDOW_SERVICE);promoteToForeground();}
  @Override public int onStartCommand(Intent i,int flags,int id){
    if(i!=null && ACTION_CAPTURE_PROMPT.equals(i.getAction())){showCapturePrompt();return START_STICKY;}
    if(i!=null && ACTION_BULB_SHOW.equals(i.getAction())){showBulb();return START_STICKY;}
    if(i!=null && ACTION_BULB_ACTIVE.equals(i.getAction())){bulbInUse=true;bulbHandler.removeCallbacks(hideBulbTask);if(bulb==null)showBulb();return START_STICKY;}
    if(i!=null && ACTION_BULB_IDLE.equals(i.getAction())){bulbInUse=false;scheduleBulbHide();return START_STICKY;}
    if(i!=null && ACTION_BULB_HIDE.equals(i.getAction())){bulbInUse=false;hideBulb();return START_STICKY;}
    if(i!=null && ACTION_CAPTURE_START.equals(i.getAction())){promoteToCaptureForeground();return START_NOT_STICKY;}
    if(i!=null && ACTION_CAPTURE_STOP.equals(i.getAction())){stopCaptureForeground();if(bar==null&&guideLine==null&&guideCard==null)stopSelf();return START_NOT_STICKY;}
    if(i!=null && ACTION_HIDE.equals(i.getAction())){removeBar();stopSelf();return START_NOT_STICKY;}
    if(i!=null && ACTION_HIDE_GUIDE.equals(i.getAction())){removeGuide();return START_STICKY;}
    if(i!=null && ACTION_TARGET.equals(i.getAction())){updateGuideTarget(i);return START_STICKY;}
    if(i!=null && ACTION_GUIDE.equals(i.getAction())){guideInstruction=i.getStringExtra("instruction")!=null?i.getStringExtra("instruction"):"Follow the tether to the next step.";if(!Settings.canDrawOverlays(this)){Intent p=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(p);return START_NOT_STICKY;}showGuide();return START_STICKY;}
    if(i!=null){widgetWidth=i.getIntExtra("widgetWidth",widgetWidth);widgetHeight=i.getIntExtra("widgetHeight",widgetHeight);cornerDp=i.getIntExtra("cornerDp",cornerDp);borderDp=i.getIntExtra("borderDp",borderDp);eyeWidth=i.getIntExtra("eyeWidth",eyeWidth);eyeHeight=i.getIntExtra("eyeHeight",eyeHeight);eyeGapDp=i.getIntExtra("eyeGapDp",eyeGapDp);eyeShape=i.getStringExtra("eyeShape")!=null?i.getStringExtra("eyeShape"):eyeShape;}
    if(ACTION_STYLE.equals(i==null?null:i.getAction())){removeBar();}
    if(!Settings.canDrawOverlays(this)){Intent p=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(p);return START_NOT_STICKY;}
    showBar();return START_STICKY;
  }
  static class GhostMascotView extends View {
    final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    final Path ghost=new Path();
    final Path accent=new Path();
    GhostMascotView(Context context){super(context);setContentDescription("Bosley floating ghost companion. Tap to open, hold to talk, and reposition with a touch gesture.");setLayerType(View.LAYER_TYPE_SOFTWARE,null);}
    @Override protected void onDraw(Canvas canvas){
      super.onDraw(canvas);
      float sx=getWidth()/120f,sy=getHeight()/112f;
      canvas.save();canvas.scale(sx,sy);
      paint.setStyle(Paint.Style.FILL);paint.setColor(Color.WHITE);paint.setShadowLayer(5,0,4,0x88000000);
      ghost.reset();ghost.moveTo(60,8);ghost.cubicTo(34,8,18,27,18,52);ghost.lineTo(18,92);ghost.cubicTo(18,97,22,99,26,96);ghost.lineTo(37,87);ghost.lineTo(49,97);ghost.cubicTo(52,99,55,99,58,96);ghost.lineTo(60,94);ghost.lineTo(72,102);ghost.cubicTo(75,104,78,103,80,100);ghost.lineTo(89,88);ghost.lineTo(97,95);ghost.cubicTo(101,98,105,96,105,91);ghost.lineTo(102,52);ghost.cubicTo(102,27,86,8,60,8);ghost.close();canvas.drawPath(ghost,paint);paint.clearShadowLayer();
      paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(3.4f);paint.setStrokeJoin(Paint.Join.ROUND);paint.setColor(Color.rgb(16,24,32));canvas.drawPath(ghost,paint);
      paint.setStyle(Paint.Style.FILL);paint.setColor(Color.rgb(5,5,5));
      float phase=android.os.SystemClock.uptimeMillis()%5100;float blink=(phase>2350&&phase<2490)?.12f:1f;
      canvas.save();canvas.translate(45,51);canvas.scale(1,blink);canvas.drawOval(-7.2f,-10.2f,7.2f,10.2f,paint);canvas.restore();
      canvas.save();canvas.translate(75,51);canvas.scale(1,blink);canvas.drawOval(-7.2f,-10.2f,7.2f,10.2f,paint);canvas.restore();
      canvas.restore();
      if(blink<1f)postInvalidateDelayed(35);else postInvalidateDelayed(Math.max(40,(long)(5100-phase)));
    }
  }
  void showBar(){if(bar!=null)return;
    GhostMascotView mascot=new GhostMascotView(this);bar=mascot;
    lp=new WindowManager.LayoutParams(dp(44),dp(44),Build.VERSION.SDK_INT>=26?WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY:WindowManager.LayoutParams.TYPE_PHONE,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT);
    // Use absolute screen coordinates so the mascot can be placed anywhere.
    // Initial position: right edge, slightly above vertical centre.
    lp.gravity=Gravity.TOP|Gravity.START;
    DisplayMetrics screen=new DisplayMetrics();wm.getDefaultDisplay().getRealMetrics(screen);
    int screenWidth=screen.widthPixels,screenHeight=screen.heightPixels,widgetSize=dp(44);
    lp.x=Math.max(0,screenWidth-widgetSize-dp(10));lp.y=Math.max(dp(72),(int)(screenHeight*.36f));
    mascot.setOnTouchListener(new View.OnTouchListener(){float sx,sy;int ox,oy;long down;boolean moved,longPressed;Handler gestureHandler=new Handler(Looper.getMainLooper());Runnable holdAction=()->{if(!moved){longPressed=true;openCompanion("voice");}};
      public boolean onTouch(View v,android.view.MotionEvent e){switch(e.getAction()){
        case MotionEvent.ACTION_DOWN:sx=e.getRawX();sy=e.getRawY();ox=lp.x;oy=lp.y;down=System.currentTimeMillis();moved=false;longPressed=false;gestureHandler.postDelayed(holdAction,480);return true;
        case MotionEvent.ACTION_MOVE:if(Math.abs(e.getRawX()-sx)>8||Math.abs(e.getRawY()-sy)>8){moved=true;gestureHandler.removeCallbacks(holdAction);lp.x=Math.max(0,Math.min(screenWidth-widgetSize,ox+(int)(e.getRawX()-sx)));lp.y=Math.max(0,Math.min(screenHeight-widgetSize,oy+(int)(e.getRawY()-sy)));try{wm.updateViewLayout(bar,lp);}catch(Exception ignored){}}return true;
        case MotionEvent.ACTION_UP:gestureHandler.removeCallbacks(holdAction);if(!moved&&!longPressed&&System.currentTimeMillis()-down<480){if(bulb!=null){bulbInUse=false;hideBulb();openCompanion("panel");}else{bulbInUse=false;showBulb();}}return true;
        case MotionEvent.ACTION_CANCEL:gestureHandler.removeCallbacks(holdAction);return true;
      }return true;}});
    try{wm.addView(bar,lp);}catch(Exception e){bar=null;}
  }
  void showCapturePrompt(){
    if(capturePrompt!=null)return;
    if(!Settings.canDrawOverlays(this)){openCompanion("capture-screen");return;}
    TextView ok=new TextView(this);ok.setText("OK");ok.setTextColor(Color.BLACK);ok.setTextSize(13);ok.setTypeface(null,android.graphics.Typeface.BOLD);ok.setGravity(Gravity.CENTER);
    GradientDrawable bg=new GradientDrawable();bg.setColor(Color.WHITE);bg.setCornerRadius(dp(12));bg.setStroke(dp(1),Color.rgb(35,35,35));ok.setBackground(bg);ok.setElevation(dp(10));ok.setContentDescription("Tap OK to capture the screen currently visible behind Bosley.");
    capturePrompt=ok;
    capturePromptLp=new WindowManager.LayoutParams(dp(72),dp(42),Build.VERSION.SDK_INT>=26?WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY:WindowManager.LayoutParams.TYPE_PHONE,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT);
    capturePromptLp.gravity=Gravity.TOP|Gravity.END;capturePromptLp.x=dp(18);capturePromptLp.y=dp(132);
    ok.setOnClickListener(v->{removeCapturePrompt();openCompanion("capture-screen");});
    try{wm.addView(capturePrompt,capturePromptLp);}catch(Exception e){capturePrompt=null;}
  }
  void removeCapturePrompt(){if(wm!=null&&capturePrompt!=null){try{wm.removeView(capturePrompt);}catch(Exception ignored){}capturePrompt=null;}}
  void showBulb(){
    if(bulb!=null){scheduleBulbHide();return;}
    View writingBulb=new View(this){
      final Paint iconPaint=new Paint(Paint.ANTI_ALIAS_FLAG);
      @Override protected void onDraw(Canvas canvas){
        super.onDraw(canvas);
        float scale=Math.min(getWidth(),getHeight())/40f;
        canvas.save();canvas.translate((getWidth()-40f*scale)/2f,(getHeight()-40f*scale)/2f);canvas.scale(scale,scale);
        Path bulbPath=new Path();bulbPath.moveTo(12,22);bulbPath.cubicTo(5,14,10,4,20,4);bulbPath.cubicTo(30,4,35,14,28,22);bulbPath.cubicTo(26,24,25,26,25,28);bulbPath.lineTo(15,28);bulbPath.cubicTo(15,26,14,24,12,22);bulbPath.close();
        iconPaint.setStyle(Paint.Style.FILL);iconPaint.setColor(Color.WHITE);canvas.drawPath(bulbPath,iconPaint);
        iconPaint.setStyle(Paint.Style.STROKE);iconPaint.setStrokeWidth(1.8f);iconPaint.setStrokeCap(Paint.Cap.ROUND);iconPaint.setStrokeJoin(Paint.Join.ROUND);iconPaint.setColor(Color.BLACK);canvas.drawPath(bulbPath,iconPaint);
        iconPaint.setStrokeWidth(1.6f);canvas.drawLine(15,31,25,31,iconPaint);canvas.drawLine(16,34,24,34,iconPaint);canvas.drawLine(20,0,20,2,iconPaint);canvas.drawLine(5,7,7,9,iconPaint);canvas.drawLine(33,7,35,5,iconPaint);
        canvas.restore();
      }
    };
    writingBulb.setContentDescription("Bosley Writing and Ideas. Tap to open the compact writing assistant card.");
    GradientDrawable bulbBg=new GradientDrawable();bulbBg.setColor(Color.WHITE);bulbBg.setShape(GradientDrawable.OVAL);bulbBg.setStroke(dp(1),Color.rgb(20,20,20));writingBulb.setBackground(bulbBg);
    writingBulb.setElevation(dp(8));bulb=writingBulb;
    bulbLp=new WindowManager.LayoutParams(dp(40),dp(40),Build.VERSION.SDK_INT>=26?WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY:WindowManager.LayoutParams.TYPE_PHONE,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT);
    bulbLp.gravity=Gravity.TOP|Gravity.START;bulbLp.x=lp!=null?Math.max(0,lp.x-dp(48)):dp(12);bulbLp.y=lp!=null?lp.y+dp(2):dp(72);
    writingBulb.setOnTouchListener(new View.OnTouchListener(){float downX,downY;int startX,startY;boolean dragged;@Override public boolean onTouch(View v,android.view.MotionEvent e){switch(e.getActionMasked()){case android.view.MotionEvent.ACTION_DOWN:downX=e.getRawX();downY=e.getRawY();startX=bulbLp.x;startY=bulbLp.y;dragged=false;return true;case android.view.MotionEvent.ACTION_MOVE:int dx=(int)(e.getRawX()-downX),dy=(int)(e.getRawY()-downY);if(Math.abs(dx)+Math.abs(dy)>dp(7))dragged=true;if(dragged){DisplayMetrics dm=new DisplayMetrics();wm.getDefaultDisplay().getRealMetrics(dm);bulbLp.x=Math.max(0,Math.min(dm.widthPixels-dp(40),startX+dx));bulbLp.y=Math.max(dp(24),Math.min(dm.heightPixels-dp(40),startY+dy));try{wm.updateViewLayout(bulb,bulbLp);}catch(Exception ignored){}}return true;case android.view.MotionEvent.ACTION_UP:if(!dragged){bulbInUse=true;bulbHandler.removeCallbacks(hideBulbTask);hideBulb();showWritingCardOverlay();}return true;case android.view.MotionEvent.ACTION_CANCEL:return true;default:return true;}}});
    try{wm.addView(bulb,bulbLp);}catch(Exception e){bulb=null;}
    scheduleBulbHide();
  }
  View writingCardOverlay; WindowManager.LayoutParams writingCardLp;
  void showWritingCardOverlay(){
    if(writingCardOverlay!=null)return;
    LinearLayout card=new LinearLayout(this);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(dp(14),dp(12),dp(14),dp(12));card.setElevation(dp(18));
    GradientDrawable shell=new GradientDrawable();shell.setColor(Color.rgb(12,12,12));shell.setCornerRadius(dp(18));shell.setStroke(dp(1),Color.rgb(110,110,110));card.setBackground(shell);
    LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);
    TextView title=new TextView(this);title.setText("Writing & Ideas");title.setTextColor(Color.WHITE);title.setTextSize(15);title.setTypeface(null,android.graphics.Typeface.BOLD);header.addView(title,new LinearLayout.LayoutParams(0,-2,1));
    TextView close=new TextView(this);close.setText("×");close.setTextColor(Color.WHITE);close.setTextSize(25);close.setGravity(Gravity.CENTER);header.addView(close,new LinearLayout.LayoutParams(dp(36),dp(36)));card.addView(header);
    TextView hint=new TextView(this);hint.setText("Write or paste text here. Your draft stays in this floating card.");hint.setTextColor(Color.LTGRAY);hint.setTextSize(11);LinearLayout.LayoutParams hp=new LinearLayout.LayoutParams(-1,-2);hp.topMargin=dp(4);card.addView(hint,hp);
    EditText editor=new EditText(this);editor.setTextColor(Color.WHITE);editor.setHintTextColor(Color.GRAY);editor.setHint("Start writing…");editor.setTextSize(14);editor.setGravity(Gravity.TOP|Gravity.START);editor.setPadding(dp(10),dp(10),dp(10),dp(10));editor.setMinLines(6);editor.setMaxLines(10);editor.setBackgroundColor(Color.rgb(30,30,30));LinearLayout.LayoutParams ep=new LinearLayout.LayoutParams(-1,dp(190));ep.topMargin=dp(10);card.addView(editor,ep);
    LinearLayout actions=new LinearLayout(this);actions.setGravity(Gravity.CENTER_VERTICAL);actions.setOrientation(LinearLayout.HORIZONTAL);
    Button copy=new Button(this);copy.setText("Copy");copy.setOnClickListener(v->{android.content.ClipboardManager cm=(android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE);cm.setPrimaryClip(ClipData.newPlainText("Bosley writing",editor.getText().toString()));Toast.makeText(this,"Text copied",Toast.LENGTH_SHORT).show();});
    Button clear=new Button(this);clear.setText("Clear");clear.setOnClickListener(v->editor.setText(""));
    Button expand=new Button(this);expand.setText("Open Bosley");expand.setOnClickListener(v->{removeWritingCardOverlay();openCompanion("writing-card");});
    actions.addView(copy,new LinearLayout.LayoutParams(0,dp(44),1));actions.addView(clear,new LinearLayout.LayoutParams(0,dp(44),1));actions.addView(expand,new LinearLayout.LayoutParams(0,dp(44),1));LinearLayout.LayoutParams ap=new LinearLayout.LayoutParams(-1,-2);ap.topMargin=dp(8);card.addView(actions,ap);
    writingCardOverlay=card;writingCardLp=new WindowManager.LayoutParams(dp(320),WindowManager.LayoutParams.WRAP_CONTENT,Build.VERSION.SDK_INT>=26?WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY:WindowManager.LayoutParams.TYPE_PHONE,WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT);
    writingCardLp.gravity=Gravity.TOP|Gravity.START;DisplayMetrics dm=new DisplayMetrics();wm.getDefaultDisplay().getRealMetrics(dm);writingCardLp.x=Math.max(dp(8),(dm.widthPixels-dp(320))/2);writingCardLp.y=Math.max(dp(42),(int)(dm.heightPixels*.20f));writingCardLp.softInputMode=WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE;
    title.setOnTouchListener(new View.OnTouchListener(){float sx,sy;int ox,oy;public boolean onTouch(View v,MotionEvent e){if(e.getAction()==MotionEvent.ACTION_DOWN){sx=e.getRawX();sy=e.getRawY();ox=writingCardLp.x;oy=writingCardLp.y;return true;}if(e.getAction()==MotionEvent.ACTION_MOVE){writingCardLp.x=Math.max(0,Math.min(dm.widthPixels-dp(320),ox+(int)(e.getRawX()-sx)));writingCardLp.y=Math.max(0,Math.min(dm.heightPixels-dp(120),oy+(int)(e.getRawY()-sy)));try{wm.updateViewLayout(writingCardOverlay,writingCardLp);}catch(Exception ignored){}return true;}return true;}});
    close.setOnClickListener(v->removeWritingCardOverlay());
    try{wm.addView(writingCardOverlay,writingCardLp);editor.requestFocus();((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(editor,android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);}catch(Exception e){writingCardOverlay=null;}
  }
  void removeWritingCardOverlay(){if(wm!=null&&writingCardOverlay!=null){try{wm.removeView(writingCardOverlay);}catch(Exception ignored){}writingCardOverlay=null;}}
  void scheduleBulbHide(){bulbHandler.removeCallbacks(hideBulbTask);if(!bulbInUse&&bulb!=null)bulbHandler.postDelayed(hideBulbTask,5000);}
  void hideBulb(){bulbHandler.removeCallbacks(hideBulbTask);if(wm!=null&&bulb!=null){try{wm.removeView(bulb);}catch(Exception ignored){}bulb=null;}}
  void openCompanion(String action){Intent a=new Intent(BosleyOverlayService.this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);a.putExtra("bosley_quick_action",action);startActivity(a);}
  void showGuide(){
    removeGuide();
    final android.util.DisplayMetrics metrics=getResources().getDisplayMetrics();
    final int width=metrics.widthPixels,height=metrics.heightPixels;
    guideLine=new View(this){final Paint paint=new Paint(3);@Override protected void onDraw(Canvas canvas){super.onDraw(canvas);float sx=width*.5f,sy=height-dp(42),tx=guideTargetX*width,ty=guideTargetY*height;paint.setStyle(Paint.Style.STROKE);Path p=new Path();p.moveTo(sx,sy);p.cubicTo(sx,sy-dp(120),tx-dp(80),ty+dp(80),tx,ty);paint.setColor(Color.BLACK);paint.setStrokeWidth(dp(6));paint.setPathEffect(new DashPathEffect(new float[]{dp(7),dp(8)},(System.currentTimeMillis()/45f)%30));canvas.drawPath(p,paint);paint.setColor(Color.WHITE);paint.setStrokeWidth(dp(2));paint.setPathEffect(new DashPathEffect(new float[]{dp(7),dp(8)},(System.currentTimeMillis()/45f)%30));canvas.drawPath(p,paint);paint.setStyle(Paint.Style.FILL);paint.setPathEffect(null);paint.setColor(Color.BLACK);canvas.drawCircle(tx,ty,dp(9),paint);paint.setColor(Color.WHITE);canvas.drawCircle(tx,ty,dp(6),paint);postInvalidateDelayed(40);}};
    guideLineLp=new WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT,WindowManager.LayoutParams.MATCH_PARENT,Build.VERSION.SDK_INT>=26?WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY:WindowManager.LayoutParams.TYPE_PHONE,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN|WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,PixelFormat.TRANSLUCENT);
    guideLineLp.gravity=Gravity.TOP|Gravity.START;
    try{wm.addView(guideLine,guideLineLp);}catch(Exception e){guideLine=null;return;}
    TextView target=new TextView(this);target.setText("•");target.setTextColor(Color.BLACK);target.setTextSize(30);target.setGravity(Gravity.CENTER);target.setBackground(circleTarget());target.setElevation(dp(10));guideTarget=target;
    guideTargetLp=new WindowManager.LayoutParams(dp(42),dp(42),Build.VERSION.SDK_INT>=26?WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY:WindowManager.LayoutParams.TYPE_PHONE,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT);
    guideTargetLp.gravity=Gravity.TOP|Gravity.START;guideTargetLp.x=(int)(width*guideTargetX)-dp(21);guideTargetLp.y=(int)(height*guideTargetY)-dp(21);
    // Target is fixed in place; no drag gesture is registered.
    try{wm.addView(guideTarget,guideTargetLp);}catch(Exception e){guideTarget=null;}
    LinearLayout card=new LinearLayout(this);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(dp(10),dp(8),dp(10),dp(8));card.setElevation(dp(12));
    GradientDrawable bg=new GradientDrawable();bg.setColor(Color.rgb(8,8,8));bg.setCornerRadius(dp(12));bg.setStroke(dp(1),Color.LTGRAY);card.setBackground(bg);
    TextView title=new TextView(this);title.setText("BOSLEY GUIDE");title.setTextColor(Color.WHITE);title.setTextSize(11);title.setTypeface(null,android.graphics.Typeface.BOLD);title.setPadding(0,0,0,dp(2));card.addView(title);
    TextView body=new TextView(this);body.setText(guideInstruction+"\nUse Find target to locate a matching visible control. Bosley does not click or type.");body.setTextColor(Color.LTGRAY);body.setTextSize(11);LinearLayout.LayoutParams bp=new LinearLayout.LayoutParams(-1,-2);bp.topMargin=dp(4);card.addView(body,bp);guideStatusView=body;
    TextView findStatus=new TextView(this);findStatus.setText("Find target is not included in this direct-install build.");findStatus.setTextColor(Color.LTGRAY);findStatus.setTextSize(11);LinearLayout.LayoutParams fp=new LinearLayout.LayoutParams(-1,dp(36));fp.topMargin=dp(3);card.addView(findStatus,fp);
    Button stop=new Button(this);stop.setText("Stop");stop.setTextColor(Color.WHITE);stop.setOnClickListener(v->removeGuide());LinearLayout.LayoutParams sp=new LinearLayout.LayoutParams(-1,dp(36));sp.topMargin=dp(2);card.addView(stop,sp);
    guideCard=card;guideCardLp=new WindowManager.LayoutParams(dp(250),WindowManager.LayoutParams.WRAP_CONTENT,Build.VERSION.SDK_INT>=26?WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY:WindowManager.LayoutParams.TYPE_PHONE,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT);guideCardLp.gravity=Gravity.TOP|Gravity.START;guideCardLp.x=dp(12);guideCardLp.y=dp(64);
    // Guide card remains in its default position; no drag listener.
    try{wm.addView(guideCard,guideCardLp);}catch(Exception e){guideCard=null;removeGuide();}
  }
  GradientDrawable circleTarget(){GradientDrawable d=new GradientDrawable();d.setShape(GradientDrawable.OVAL);d.setColor(Color.WHITE);d.setStroke(dp(3),Color.BLACK);return d;}
  void updateGuideTarget(Intent result){if(!result.getBooleanExtra("found",false)){if(guideStatusView!=null)guideStatusView.setText("No matching control found. Keep the target app visible and try a more specific instruction.");return;}guideTargetX=Math.max(0f,Math.min(1f,result.getFloatExtra("x",guideTargetX)));guideTargetY=Math.max(0f,Math.min(1f,result.getFloatExtra("y",guideTargetY)));guideTargetLabel=result.getStringExtra("label")!=null?result.getStringExtra("label"):"matching control";if(guideTarget!=null&&guideTargetLp!=null){DisplayMetrics dm=getResources().getDisplayMetrics();guideTargetLp.x=Math.max(0,(int)(dm.widthPixels*guideTargetX)-dp(21));guideTargetLp.y=Math.max(0,(int)(dm.heightPixels*guideTargetY)-dp(21));try{wm.updateViewLayout(guideTarget,guideTargetLp);}catch(Exception ignored){}}if(guideLine!=null)guideLine.invalidate();if(guideStatusView!=null)guideStatusView.setText("Target found: "+guideTargetLabel+". Visual guidance only; Bosley will not click or type.");}
  void removeGuide(){guideStatusView=null;if(wm!=null&&guideTarget!=null){try{wm.removeView(guideTarget);}catch(Exception ignored){}guideTarget=null;}if(wm!=null&&guideLine!=null){try{wm.removeView(guideLine);}catch(Exception ignored){}guideLine=null;}if(wm!=null&&guideCard!=null){try{wm.removeView(guideCard);}catch(Exception ignored){}guideCard=null;}}
  void removeBar(){hideBulb();removeWritingCardOverlay();if(wm!=null&&bar!=null){try{wm.removeView(bar);}catch(Exception ignored){}bar=null;}}
  int dp(float v){return (int)(v*getResources().getDisplayMetrics().density+.5f);}
  @Override public void onDestroy(){removeBar();removeWritingCardOverlay();removeGuide();super.onDestroy();}
  @Override public android.os.IBinder onBind(Intent i){return null;}
}''')
(src / "BosleyTargetAccessibilityService.java").write_text(r'''package com.bosley.companion;
import android.accessibilityservice.AccessibilityService;
import android.content.*;
import android.graphics.Rect;
import android.os.Build;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import java.util.*;
import java.util.regex.*;

public class BosleyTargetAccessibilityService extends AccessibilityService {
  static final String FIND="com.bosley.companion.FIND_GUIDE_TARGET";
  BroadcastReceiver receiver;
  @Override protected void onServiceConnected(){
    super.onServiceConnected();
    receiver=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){if(FIND.equals(i.getAction()))findTarget(i.getStringExtra("task"));}};
    if(Build.VERSION.SDK_INT>=33)registerReceiver(receiver,new IntentFilter(FIND),Context.RECEIVER_NOT_EXPORTED);
    else registerReceiver(receiver,new IntentFilter(FIND));
  }
  @Override public void onAccessibilityEvent(android.view.accessibility.AccessibilityEvent event){}
  @Override public void onInterrupt(){}
  void findTarget(String task){
    Set<String> words=new HashSet<>();
    Matcher m=Pattern.compile("[a-zA-Z0-9]{3,}").matcher((task==null?"":task).toLowerCase(Locale.ROOT));
    Set<String> stop=new HashSet<>(Arrays.asList("the","and","for","with","from","this","that","into","your","open","find","click","tap","guide","task","screen","app","please","then","have","where","relevant","complete","action","before","leaving","goal"));
    while(m.find()){String word=m.group();if(!stop.contains(word))words.add(word);}
    int bestScore=0;Rect bestBounds=null;String bestLabel="matching control";
    try{
      for(AccessibilityWindowInfo window:getWindows()){
        AccessibilityNodeInfo root=window.getRoot();if(root==null)continue;
        try{
          if(getPackageName().equals(String.valueOf(root.getPackageName())))continue;
          ArrayDeque<AccessibilityNodeInfo> stack=new ArrayDeque<>();stack.push(root);
          while(!stack.isEmpty()){
            AccessibilityNodeInfo node=stack.pop();if(node==null)continue;
            CharSequence a=node.getText(),b=node.getContentDescription(),c=node.getViewIdResourceName();
            String label=((a==null?"":a.toString())+" "+(b==null?"":b.toString())+" "+(c==null?"":c.toString().replace('_',' '))).toLowerCase(Locale.ROOT);
            int score=0;for(String word:words)if(label.contains(word))score+=word.length()>=6?3:2;
            if(score>bestScore&&(node.isClickable()||node.isFocusable()||node.isEditable()||node.isCheckable())){
              Rect bounds=new Rect();node.getBoundsInScreen(bounds);if(bounds.width()>0&&bounds.height()>0){bestScore=score;bestBounds=bounds;bestLabel=label.trim();}
            }
            for(int n=node.getChildCount()-1;n>=0;n--){AccessibilityNodeInfo child=node.getChild(n);if(child!=null)stack.push(child);}
            node.recycle();
          }
        }finally{root.recycle();}
      }
    }catch(Exception ignored){}
    Intent result=new Intent(BosleyOverlayService.ACTION_TARGET);result.setPackage(getPackageName());
    if(bestBounds==null||bestScore<2){result.putExtra("found",false);}
    else {android.util.DisplayMetrics dm=getResources().getDisplayMetrics();result.putExtra("found",true);result.putExtra("label",bestLabel.length()>100?bestLabel.substring(0,100):bestLabel);result.putExtra("x",Math.max(0,Math.min(1f,((bestBounds.left+bestBounds.right)/2f)/dm.widthPixels)));result.putExtra("y",Math.max(0,Math.min(1f,((bestBounds.top+bestBounds.bottom)/2f)/dm.heightPixels)));}
    if(Build.VERSION.SDK_INT>=26)getApplicationContext().startForegroundService(result);else startService(result);
  }
  @Override public void onDestroy(){if(receiver!=null){try{unregisterReceiver(receiver);}catch(Exception ignored){}}super.onDestroy();}
}''')

(src / "BosleyKeyboardService.java").write_text(r"""package com.bosley.companion;
import android.inputmethodservice.InputMethodService;
import android.view.View;
import android.view.Gravity;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.EditorInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.InputType;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.Locale;
public class BosleyKeyboardService extends InputMethodService {
  private LinearLayout root, suggestions;
  private boolean shift=true, sensitive=false, symbols=false, emojiMode=false;
  private final java.util.ArrayList<TextView> letterKeys=new java.util.ArrayList<>();
  private final java.util.ArrayList<TextView> suggestionKeys=new java.util.ArrayList<>();
  private final java.util.ArrayList<Runnable> suggestionActions=new java.util.ArrayList<>();
  private int suggestionCount=0;
  private TextView shiftKey;
  private static final String[] LETTERS={"q","w","e","r","t","y","u","i","o","p","a","s","d","f","g","h","j","k","l","z","x","c","v","b","n","m"};
  private static final String[] WORDS={"about","above","after","again","also","always","amazing","and","any","are","because","before","being","best","better","can","chat","could","day","dear","did","do","doing","dont","each","even","every","feel","find","first","for","from","get","give","going","good","great","had","has","have","hello","help","here","hey","how","i","if","important","into","is","it","just","know","like","make","message","more","much","my","need","new","not","now","of","on","one","only","or","our","out","please","really","right","said","see","should","so","some","something","thanks","that","the","their","there","they","this","time","today","tomorrow","too","was","we","well","what","when","where","which","who","will","with","would","yes","you","your"};
  private static final String[] EMOJIS={"😀","😂","🥹","😊","😍","🙏","❤️","👍","🔥","🎉","😭","🤝","✨","😎","🥰","💯","👏","🤔"};
  private static final String[][] SYMBOL_ROWS={{"1","2","3","4","5","6","7","8","9","0"},{"@","#","$","%","&","-","+","(",")"},{"=","*","\"","'",":",";","!","?","⌫"},{"ABC","😀",",","space",".","↵"}};
  private int dp(float v){return (int)(v*getResources().getDisplayMetrics().density+.5f);}
  private GradientDrawable bg(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
  @Override public View onCreateInputView(){buildKeyboard();return root;}
  @Override public void onStartInput(EditorInfo info,boolean restarting){
    super.onStartInput(info,restarting);
    int cls=info==null?InputType.TYPE_CLASS_TEXT:info.inputType&InputType.TYPE_MASK_CLASS;
    int v=info==null?0:info.inputType&InputType.TYPE_MASK_VARIATION;
    sensitive=(cls==InputType.TYPE_CLASS_NUMBER&&v==InputType.TYPE_NUMBER_VARIATION_PASSWORD)||(cls==InputType.TYPE_CLASS_TEXT&&(v==InputType.TYPE_TEXT_VARIATION_PASSWORD||v==InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD||v==InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD));
    symbols=cls==InputType.TYPE_CLASS_NUMBER;emojiMode=false;shift=true;
    if(root==null)buildKeyboard();else{buildRows();updateLetterCase();refreshSuggestions();}
  }
  private TextView keyView(String label,float weight,int height,boolean accent){
    TextView b=new TextView(this);b.setText(label);b.setTextColor(accent?Color.WHITE:Color.rgb(32,38,46));b.setTextSize(label.length()>2?12:17);b.setGravity(Gravity.CENTER);b.setTypeface(null,Typeface.BOLD);
    b.setBackground(bg(accent?Color.rgb(92,132,190):(weight<0.9f?Color.rgb(188,201,218):Color.WHITE),9));
    b.setElevation(dp(weight<0.9f?0:1));b.setMinHeight(dp(height));b.setMinimumWidth(dp(34));b.setIncludeFontPadding(false);b.setClickable(true);b.setGravity(Gravity.CENTER);b.setPadding(dp(2),dp(2),dp(2),dp(2));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(height),weight);lp.setMargins(dp(1),dp(2),dp(1),dp(2));b.setLayoutParams(lp);
    b.setOnClickListener(v->press(label));return b;
  }
  private void buildKeyboard(){
    root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(3),dp(4),dp(3),dp(5));root.setBackground(bg(Color.rgb(218,224,232),14));root.setClipToPadding(false);root.setClipChildren(false);
    suggestions=new LinearLayout(this);suggestions.setOrientation(LinearLayout.HORIZONTAL);suggestions.setGravity(Gravity.CENTER);suggestions.setPadding(dp(3),0,dp(3),0);root.addView(suggestions,new LinearLayout.LayoutParams(-1,dp(36)));
    for(int i=0;i<3;i++){final int index=i;TextView v=new TextView(this);v.setTextColor(Color.rgb(38,43,50));v.setTextSize(13);v.setTypeface(null,Typeface.BOLD);v.setGravity(Gravity.CENTER);v.setPadding(dp(6),0,dp(6),0);v.setBackground(bg(Color.rgb(230,234,240),8));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-1,1);lp.setMargins(dp(2),dp(1),dp(2),dp(1));v.setMinWidth(dp(34));v.setMinimumHeight(dp(36));v.setIncludeFontPadding(false);suggestions.addView(v,lp);suggestionKeys.add(v);suggestionActions.add(null);v.setOnClickListener(x->{Runnable action=suggestionActions.get(index);if(action!=null)action.run();});}
    buildRows();refreshSuggestions();
  }
  private void addRow(String[] keys,int height){
    LinearLayout line=new LinearLayout(this);line.setGravity(Gravity.CENTER);root.addView(line,new LinearLayout.LayoutParams(-1,dp(height)));
    for(String k:keys){
      float w=("space".equals(k)?4.2f:("⇧".equals(k)||"⌫".equals(k)||"?123".equals(k)||"ABC".equals(k)||"↵".equals(k)?1.45f:("😀".equals(k)?1.3f:1f)));
      boolean accent="↵".equals(k)||"⇧".equals(k)||"⌫".equals(k)||"?123".equals(k)||"ABC".equals(k);
      TextView v=keyView(k,w,height-3,accent);line.addView(v);
      if(LETTERS.length>0&&k.length()==1&&Character.isLetter(k.charAt(0)))letterKeys.add(v);
      if("⇧".equals(k))shiftKey=v;
      if("⌫".equals(k))v.setOnLongClickListener(x->{InputConnection ic=getCurrentInputConnection();if(ic!=null)ic.deleteSurroundingText(40,0);refreshSuggestions();return true;});
    }
  }
  private void buildRows(){
    if(root==null)return;
    root.removeViews(1,Math.max(0,root.getChildCount()-1));letterKeys.clear();shiftKey=null;
    if(!symbols&&!emojiMode)addRow(new String[]{"1","2","3","4","5","6","7","8","9","0"},39);
    String[][] rows=symbols?SYMBOL_ROWS:new String[][]{{"q","w","e","r","t","y","u","i","o","p"},{"a","s","d","f","g","h","j","k","l"},{"⇧","z","x","c","v","b","n","m","⌫"},{"?123","😀",",","space",".","↵"}};
    if(emojiMode){
      addRow(new String[]{"ABC","😀","⌫"},42);
      for(int i=0;i<EMOJIS.length;i+=9){String[] part=java.util.Arrays.copyOfRange(EMOJIS,i,Math.min(i+9,EMOJIS.length));addRow(part,42);}
      addRow(new String[]{"ABC",",","space",".","↵"},45);
    }else for(String[] row:rows)addRow(row,44);
    updateLetterCase();
  }
  private void updateLetterCase(){for(TextView v:letterKeys){String k=v.getText().toString();v.setText(shift?k.toUpperCase(Locale.ROOT):k.toLowerCase(Locale.ROOT));}if(shiftKey!=null)shiftKey.setText(shift?"⬆":"⇧");}
  private void press(String k){
    InputConnection ic=getCurrentInputConnection();if(ic==null)return;
    if("⌫".equals(k)){ic.deleteSurroundingText(1,0);refreshSuggestions();return;}
    if("⇧".equals(k)){shift=!shift;updateLetterCase();return;}
    if("?123".equals(k)){symbols=true;emojiMode=false;buildRows();refreshSuggestions();return;}
    if("ABC".equals(k)){symbols=false;emojiMode=false;shift=true;buildRows();refreshSuggestions();return;}
    if("😀".equals(k)){emojiMode=!emojiMode;symbols=false;buildRows();refreshSuggestions();return;}
    if("space".equals(k)){
      String before=String.valueOf(ic.getTextBeforeCursor(48,0));String word=lastWord(before);String fix=correction(word);
      if(fix!=null){ic.deleteSurroundingText(word.length(),0);ic.commitText(fix,1);}
      ic.commitText(" ",1);shift=true;refreshSuggestions();return;
    }
    if("↵".equals(k)){EditorInfo e=getCurrentInputEditorInfo();int action=e==null?0:e.imeOptions&EditorInfo.IME_MASK_ACTION;if(action!=0)ic.performEditorAction(action);else{ic.sendKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.KEYCODE_ENTER));ic.sendKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP,android.view.KeyEvent.KEYCODE_ENTER));}return;}
    if(k.length()==1&&Character.isLetter(k.charAt(0))){ic.commitText(shift?k.toUpperCase(Locale.ROOT):k.toLowerCase(Locale.ROOT),1);shift=ic.getCursorCapsMode(InputType.TYPE_TEXT_FLAG_CAP_SENTENCES)!=0;updateLetterCase();refreshSuggestions();return;}
    ic.commitText(k,1);if(".".equals(k)||"!".equals(k)||"?".equals(k))shift=true;updateLetterCase();refreshSuggestions();
  }
  private String lastWord(String text){int i=text.length();while(i>0&&Character.isLetter(text.charAt(i-1)))i--;return text.substring(i);}
  private String correction(String w){
    if(sensitive||w==null)return null;
    switch(w.toLowerCase(Locale.ROOT)){
      case "teh":return "the";case "adn":return "and";case "thier":return "their";case "recieve":return "receive";case "definately":return "definitely";case "seperate":return "separate";case "occured":return "occurred";case "becuase":return "because";case "dont":return "don't";case "cant":return "can't";case "wont":return "won't";case "im":return "I'm";case "ive":return "I've";case "youre":return "you're";case "doesnt":return "doesn't";case "didnt":return "didn't";case "isnt":return "isn't";case "thats":return "that's";case "whats":return "what's";case "wheres":return "where's";default:return null;
    }
  }
  private void refreshSuggestions(){
    if(suggestions==null)return;suggestionCount=0;for(int i=0;i<suggestionKeys.size();i++){suggestionKeys.get(i).setVisibility(View.INVISIBLE);suggestionActions.set(i,null);}
    if(emojiMode){for(int i=0;i<Math.min(EMOJIS.length,3);i++){final String emoji=EMOJIS[i];suggestion(emoji,()->{InputConnection ic=getCurrentInputConnection();if(ic!=null)ic.commitText(emoji,1);});}return;}
    InputConnection ic=getCurrentInputConnection();if(sensitive||ic==null){suggestion("Bosley",null);return;}
    CharSequence before=ic.getTextBeforeCursor(48,0);String text=before==null?"":before.toString();String word=lastWord(text);String fix=correction(word);
    if(fix!=null)suggestion(fix,()->{InputConnection current=getCurrentInputConnection();if(current!=null){current.deleteSurroundingText(word.length(),0);current.commitText(fix,1);refreshSuggestions();}});
    else if(word.length()>0){
      int count=0;String lower=word.toLowerCase(Locale.ROOT);
      for(String candidate:WORDS){if(candidate.startsWith(lower)&&!candidate.equalsIgnoreCase(word)){final String pick=candidate;suggestion(pick,()->{InputConnection current=getCurrentInputConnection();if(current!=null){current.deleteSurroundingText(word.length(),0);current.commitText(pick+" ",1);refreshSuggestions();}});if(++count==3)break;}}
      if(count==0)suggestion(word,null);
    }else{suggestion("English",null);suggestion("Bosley",null);suggestion("😀",()->{emojiMode=true;buildRows();refreshSuggestions();});}
  }
  private void suggestion(String value,Runnable action){
    if(suggestionCount>=suggestionKeys.size())return;
    int index=suggestionCount++;TextView v=suggestionKeys.get(index);v.setText(value);v.setVisibility(View.VISIBLE);suggestionActions.set(index,action);
  }
}
""")

(src / "BosleyOverlayPlugin.java").write_text(r'''package com.bosley.companion;
import android.content.Intent;
import android.content.ClipboardManager;
import android.content.ClipData;
import android.net.Uri;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
@CapacitorPlugin(name="BosleyOverlay", permissions={@Permission(alias="microphone", strings={android.Manifest.permission.RECORD_AUDIO}), @Permission(alias="notifications", strings={android.Manifest.permission.POST_NOTIFICATIONS})})
public class BosleyOverlayPlugin extends Plugin {
  // Clipboard handoff is invoked only by the user's explicit Universal Input buttons.
  // Android may restrict reads while Bosley is backgrounded; no background polling occurs.
  @PluginMethod public void readClipboard(PluginCall call){
    ClipboardManager manager=(ClipboardManager)getContext().getSystemService(android.content.Context.CLIPBOARD_SERVICE);
    String value="";
    if(manager!=null&&manager.hasPrimaryClip()&&manager.getPrimaryClip()!=null&&manager.getPrimaryClip().getItemCount()>0){
      CharSequence text=manager.getPrimaryClip().getItemAt(0).coerceToText(getContext());
      if(text!=null)value=text.toString();
    }
    if(value.length()>12000)value=value.substring(0,12000);
    JSObject result=new JSObject();result.put("text",value);call.resolve(result);
  }
  @PluginMethod public void showKeyboardPicker(PluginCall call){
    try{((android.view.inputmethod.InputMethodManager)getContext().getSystemService(android.content.Context.INPUT_METHOD_SERVICE)).showInputMethodPicker();call.resolve();}
    catch(Exception e){call.reject("Could not open keyboard picker.",e);}
  }
  @PluginMethod public void openKeyboardSettings(PluginCall call){
    try{Intent i=new Intent(android.provider.Settings.ACTION_INPUT_METHOD_SETTINGS);i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);getContext().startActivity(i);call.resolve();}
    catch(Exception e){call.reject("Could not open keyboard settings.",e);}
  }
  @PluginMethod public void writeClipboard(PluginCall call){
    String value=call.getString("text","");
    if(value==null||value.trim().isEmpty()||value.length()>12000){call.reject("Clipboard text must contain between 1 and 12000 characters.");return;}
    ClipboardManager manager=(ClipboardManager)getContext().getSystemService(android.content.Context.CLIPBOARD_SERVICE);
    if(manager==null){call.reject("Clipboard is unavailable.");return;}
    manager.setPrimaryClip(ClipData.newPlainText("Bosley Universal Input",value));
    call.resolve();
  }
  @PluginMethod public void setWritingBulbActive(PluginCall call){boolean active=call.getBoolean("active",false);Intent intent=new Intent(getContext(),BosleyOverlayService.class).setAction(active?BosleyOverlayService.ACTION_BULB_ACTIVE:BosleyOverlayService.ACTION_BULB_IDLE);if(Build.VERSION.SDK_INT>=26)getContext().startForegroundService(intent);else getContext().startService(intent);call.resolve();}
  @PluginMethod public void showScreenCapturePrompt(PluginCall call){Intent intent=new Intent(getContext(),BosleyOverlayService.class).setAction(BosleyOverlayService.ACTION_CAPTURE_PROMPT);if(Build.VERSION.SDK_INT>=26)getContext().startForegroundService(intent);else getContext().startService(intent);call.resolve();}
  private android.speech.tts.TextToSpeech bosleyTts;
  private boolean bosleyTtsReady=false;
  private MediaProjection activeProjection;
  private VirtualDisplay captureDisplay;
  private ImageReader captureReader;
  private final Handler captureHandler=new Handler(Looper.getMainLooper());
  @PluginMethod public void speakText(PluginCall call){
    String text=call.getString("text","");
    String profile=call.getString("profile","warm");
    if(text==null||text.trim().isEmpty()){call.resolve();return;}
    if(text.length()>5000)text=text.substring(0,5000);
    final String utterance=text;
    try{
      if(bosleyTts==null){
        bosleyTts=new android.speech.tts.TextToSpeech(getContext(),status->{
          bosleyTtsReady=status==android.speech.tts.TextToSpeech.SUCCESS;
          if(bosleyTtsReady){
            int lang=bosleyTts.setLanguage(java.util.Locale.UK);
            if(lang==android.speech.tts.TextToSpeech.LANG_MISSING_DATA||lang==android.speech.tts.TextToSpeech.LANG_NOT_SUPPORTED)bosleyTts.setLanguage(java.util.Locale.getDefault());
            bosleyTts.setSpeechRate("jarvis".equals(profile)?0.9f:("warm".equals(profile)?0.96f:1.0f));
            bosleyTts.setPitch("jarvis".equals(profile)?0.78f:("warm".equals(profile)?1.04f:1.0f));
            bosleyTts.speak(utterance,android.speech.tts.TextToSpeech.QUEUE_FLUSH,null,"bosley-"+System.currentTimeMillis());
          }
        });
        JSObject r=new JSObject();r.put("queued",true);call.resolve(r);return;
      }
      if(!bosleyTtsReady){JSObject r=new JSObject();r.put("queued",false);r.put("reason","Android speech engine is still starting");call.resolve(r);return;}
      bosleyTts.setSpeechRate("jarvis".equals(profile)?0.9f:("warm".equals(profile)?0.96f:1.0f));
      bosleyTts.setPitch("jarvis".equals(profile)?0.78f:("warm".equals(profile)?1.04f:1.0f));
      bosleyTts.speak(utterance,android.speech.tts.TextToSpeech.QUEUE_FLUSH,null,"bosley-"+System.currentTimeMillis());
      JSObject r=new JSObject();r.put("queued",true);call.resolve(r);
    }catch(Exception e){call.reject("Android text-to-speech failed. Check that a text-to-speech engine is installed.",e);}
  }
  @PluginMethod public void stopSpeaking(PluginCall call){
    try{if(bosleyTts!=null)bosleyTts.stop();}catch(Exception ignored){}
    call.resolve();
  }
  @PluginMethod public void startNativeSpeechRecognition(PluginCall call){
    Intent speech=new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
    speech.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL,android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
    speech.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE,java.util.Locale.getDefault().toLanguageTag());
    speech.putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT,"Speak to Bosley");
    try{startActivityForResult(call,speech,"nativeSpeechRecognitionResult");}
    catch(Exception e){call.reject("Android speech recognition is unavailable. Enable a speech recognition service, then try again.",e);}
  }
  @ActivityCallback private void nativeSpeechRecognitionResult(PluginCall call,ActivityResult result){
    JSObject response=new JSObject();
    if(result.getResultCode()==android.app.Activity.RESULT_OK&&result.getData()!=null){
      java.util.ArrayList<String> matches=result.getData().getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
      response.put("text",matches!=null&&!matches.isEmpty()?matches.get(0):"");
    }else response.put("text","");
    call.resolve(response);
  }
  @PluginMethod public void requestScreenCapture(PluginCall call){
    if(Build.VERSION.SDK_INT<21){call.reject("Screen capture requires Android 5.0 or newer.");return;}
    MediaProjectionManager manager=(MediaProjectionManager)getContext().getSystemService(android.content.Context.MEDIA_PROJECTION_SERVICE);
    if(manager==null){call.reject("Android screen-capture service is unavailable.");return;}
    try{startActivityForResult(call,manager.createScreenCaptureIntent(),"screenCapturePermissionResult");}
    catch(Exception e){call.reject("Could not open Android's screen-capture permission prompt.",e);}
  }
  @ActivityCallback private void screenCapturePermissionResult(PluginCall call,ActivityResult result){
    if(result.getResultCode()!=android.app.Activity.RESULT_OK||result.getData()==null){call.resolve(new JSObject().put("cancelled",true));return;}
    try{
      Intent foreground=new Intent(getContext(),BosleyOverlayService.class).setAction(BosleyOverlayService.ACTION_CAPTURE_START);
      if(Build.VERSION.SDK_INT>=26)getContext().startForegroundService(foreground);else getContext().startService(foreground);
      getActivity().runOnUiThread(()->getActivity().moveTaskToBack(true));
      captureHandler.postDelayed(()->{
        try{
          MediaProjectionManager manager=(MediaProjectionManager)getContext().getSystemService(android.content.Context.MEDIA_PROJECTION_SERVICE);
          activeProjection=manager.getMediaProjection(result.getResultCode(),result.getData());
          if(activeProjection==null)throw new IllegalStateException("Android did not grant a screen-capture session.");
          WindowManager wm=(WindowManager)getContext().getSystemService(android.content.Context.WINDOW_SERVICE);
          DisplayMetrics metrics=new DisplayMetrics();wm.getDefaultDisplay().getRealMetrics(metrics);
          int width=Math.max(1,metrics.widthPixels),height=Math.max(1,metrics.heightPixels),density=metrics.densityDpi;
          captureReader=ImageReader.newInstance(width,height,PixelFormat.RGBA_8888,2);
          captureReader.setOnImageAvailableListener(reader->{
            Image image=null;Bitmap bitmap=null;
            try{
              image=reader.acquireLatestImage();if(image==null)return;
              Image.Plane plane=image.getPlanes()[0];ByteBuffer buffer=plane.getBuffer();
              int pixelStride=plane.getPixelStride(),rowStride=plane.getRowStride(),rowPadding=rowStride-pixelStride*width;
              Bitmap padded=Bitmap.createBitmap(width+Math.max(0,rowPadding/pixelStride),height,Bitmap.Config.ARGB_8888);
              padded.copyPixelsFromBuffer(buffer);bitmap=Bitmap.createBitmap(padded,0,0,width,height);padded.recycle();
              int max=1280;if(Math.max(width,height)>max){float scale=(float)max/Math.max(width,height);Bitmap scaled=Bitmap.createScaledBitmap(bitmap,Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)),true);bitmap.recycle();bitmap=scaled;}
              ByteArrayOutputStream out=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.JPEG,82,out);
              JSObject response=new JSObject();response.put("ok",true);response.put("dataUrl","data:image/jpeg;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP));
              cleanupScreenCapture();
              Intent returnToBosley=new Intent(getContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
              getContext().startActivity(returnToBosley);
              call.resolve(response);
            }catch(Exception e){cleanupScreenCapture();call.reject("Screen capture failed: "+String.valueOf(e.getMessage()),e);}
            finally{if(image!=null)image.close();if(bitmap!=null&&!bitmap.isRecycled())bitmap.recycle();}
          },captureHandler);
          activeProjection.registerCallback(new MediaProjection.Callback(){@Override public void onStop(){cleanupScreenCapture();}},captureHandler);
          captureDisplay=activeProjection.createVirtualDisplay("BosleyScreenCapture",width,height,density,DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,captureReader.getSurface(),null,captureHandler);
          captureHandler.postDelayed(()->{if(captureReader!=null){cleanupScreenCapture();call.reject("Android did not provide a screen image in time. Please try again.");}},5000);
        }catch(Exception e){cleanupScreenCapture();call.reject("Could not capture the Android screen: "+String.valueOf(e.getMessage()),e);}
      },350);
    }catch(Exception e){cleanupScreenCapture();call.reject("Could not start Android screen capture: "+String.valueOf(e.getMessage()),e);}
  }
  private void cleanupScreenCapture(){
    if(captureDisplay!=null){try{captureDisplay.release();}catch(Exception ignored){}captureDisplay=null;}
    if(captureReader!=null){try{captureReader.setOnImageAvailableListener(null,null);captureReader.close();}catch(Exception ignored){}captureReader=null;}
    if(activeProjection!=null){try{activeProjection.stop();}catch(Exception ignored){}activeProjection=null;}
    try{Intent stop=new Intent(getContext(),BosleyOverlayService.class).setAction(BosleyOverlayService.ACTION_CAPTURE_STOP);if(Build.VERSION.SDK_INT>=26)getContext().startForegroundService(stop);else getContext().startService(stop);}catch(Exception ignored){}
  }
  @Override protected void handleOnDestroy(){cleanupScreenCapture();try{if(bosleyTts!=null)bosleyTts.shutdown();}catch(Exception ignored){}super.handleOnDestroy();}
  @PluginMethod public void requestMicrophonePermission(PluginCall call){
    if(getPermissionState("microphone")!=PermissionState.GRANTED){
      requestPermissionForAlias("microphone",call,"microphonePermissionCallback");return;
    }
    JSObject r=new JSObject();r.put("granted",true);call.resolve(r);
  }
  @PermissionCallback private void microphonePermissionCallback(PluginCall call){
    boolean granted=getPermissionState("microphone")==PermissionState.GRANTED;
    JSObject r=new JSObject();r.put("granted",granted);
    if(granted)call.resolve(r);else call.reject("Microphone permission was not granted. Allow microphone access in Android app settings.");
  }
  @PluginMethod public void requestNotificationPermission(PluginCall call){
    if(Build.VERSION.SDK_INT<33||getPermissionState("notifications")==PermissionState.GRANTED){
      JSObject r=new JSObject();r.put("granted",true);r.put("required",false);call.resolve(r);return;
    }
    requestPermissionForAlias("notifications",call,"notificationPermissionCallback");
  }
  @PermissionCallback private void notificationPermissionCallback(PluginCall call){
    boolean granted=Build.VERSION.SDK_INT<33||getPermissionState("notifications")==PermissionState.GRANTED;
    JSObject r=new JSObject();r.put("granted",granted);r.put("required",false);call.resolve(r);
  }
  @PluginMethod public void requestPermission(PluginCall call){
    if(Build.VERSION.SDK_INT>=23&&!Settings.canDrawOverlays(getContext())){
      Intent i=new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:"+getContext().getPackageName()));
      startActivityForResult(call,i,"overlayPermissionResult");return;
    }
    JSObject r=new JSObject();r.put("granted",true);call.resolve(r);
  }
  @ActivityCallback private void overlayPermissionResult(PluginCall call,ActivityResult result){
    JSObject r=new JSObject();r.put("granted",Build.VERSION.SDK_INT<23||Settings.canDrawOverlays(getContext()));call.resolve(r);
  }
  @PluginMethod public void show(PluginCall call){
    if(Build.VERSION.SDK_INT>=23&&!Settings.canDrawOverlays(getContext())){call.reject("Overlay permission is required. Tap Enable floating widget and allow display over other apps.");return;}
    Intent i=styledIntent(call,BosleyOverlayService.ACTION_SHOW);
    startOverlayService(i);
    JSObject r=new JSObject();r.put("visible",true);call.resolve(r);
  }
  @PluginMethod public void showGuide(PluginCall call){
    if(Build.VERSION.SDK_INT>=23&&!Settings.canDrawOverlays(getContext())){call.reject("Enable Android display-over-other-apps permission first.");return;}
    JSObject p=call.getObject("payload",new JSObject());String instruction=p.getString("instruction","Follow the tether to the next step.");
    Intent i=new Intent(getContext(),BosleyOverlayService.class);i.setAction(BosleyOverlayService.ACTION_GUIDE);i.putExtra("instruction",instruction);startOverlayService(i);
    JSObject r=new JSObject();r.put("ok",true);r.put("state","native-overlay-requested");call.resolve(r);
  }
  @PluginMethod public void findGuideTarget(PluginCall call){
    String task=call.getString("task","");
    if(task==null||task.trim().isEmpty())task="Find the relevant control for the active Bosley guide.";
    String enabled=android.provider.Settings.Secure.getString(getContext().getContentResolver(),android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
    if(enabled==null||!enabled.contains(getContext().getPackageName()+"/"+BosleyTargetAccessibilityService.class.getName())){
      call.reject("Enable Bosley visual guide in Android Accessibility settings, then try Check target again.");return;
    }
    Intent request=new Intent(BosleyTargetAccessibilityService.FIND);
    request.setPackage(getContext().getPackageName());request.putExtra("task",task.substring(0,500));
    getContext().sendBroadcast(request);
    JSObject result=new JSObject();result.put("ok",true);result.put("state","target-search-requested");call.resolve(result);
  }
  @PluginMethod public void stopGuide(PluginCall call){Intent i=new Intent(getContext(),BosleyOverlayService.class);i.setAction(BosleyOverlayService.ACTION_HIDE_GUIDE);startOverlayService(i);JSObject r=new JSObject();r.put("ok",true);call.resolve(r);}
  @PluginMethod public void openExternalUrl(PluginCall call){
    String raw=call.getString("url","");
    try{
      if(raw==null||raw.trim().isEmpty()||raw.length()>2048)throw new IllegalArgumentException("A valid external URL is required.");
      Uri uri=Uri.parse(raw.trim());
      String scheme=uri.getScheme();
      if(!"https".equalsIgnoreCase(scheme)&&!"mailto".equalsIgnoreCase(scheme)&&!"sms".equalsIgnoreCase(scheme))throw new IllegalArgumentException("Only HTTPS, email and SMS composer links can be opened externally.");
      if("https".equalsIgnoreCase(scheme)&&(uri.getHost()==null||uri.getHost().isEmpty()))throw new IllegalArgumentException("The HTTPS link must include a host.");
      Intent intent=new Intent(Intent.ACTION_VIEW,uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      if(intent.resolveActivity(getContext().getPackageManager())==null)throw new IllegalStateException("No installed browser or app can open this link.");
      getContext().startActivity(intent);
      JSObject result=new JSObject();result.put("ok",true);result.put("url",uri.toString());call.resolve(result);
    }catch(Exception e){call.reject("Could not open the external link: "+String.valueOf(e.getMessage()),e);}
  }
  @PluginMethod public void setAppearance(PluginCall call){
    Intent i=styledIntent(call,BosleyOverlayService.ACTION_STYLE);startOverlayService(i);JSObject r=new JSObject();r.put("ok",true);call.resolve(r);
  }
  private void startOverlayService(Intent intent){
    if(Build.VERSION.SDK_INT>=26)getContext().startForegroundService(intent);
    else getContext().startService(intent);
  }
  private Intent styledIntent(PluginCall call,String action){
    Intent i=new Intent(getContext(),BosleyOverlayService.class);i.setAction(action);
    JSObject p=call.getObject("payload",new JSObject());String size=p.getString("widgetSize","default"),edge=p.getString("widgetEdge","soft"),border=p.getString("widgetBorder","medium"),eyeShape=p.getString("eyeShape","pill"),eyeGap=p.getString("eyeGap","normal"),faceSize=p.getString("size","default");
    int w=44,h=44;int c="sharp".equals(edge)?18:("balanced".equals(edge)?20:22);int b="thin".equals(border)?1:("bold".equals(border)?3:2);int ew="compact".equals(faceSize)?8:("default".equals(faceSize)?9:11),eh="compact".equals(faceSize)?15:("default".equals(faceSize)?17:20);int gap="close".equals(eyeGap)?8:("wide".equals(eyeGap)?16:12);
    i.putExtra("widgetWidth",w);i.putExtra("widgetHeight",h);i.putExtra("cornerDp",c);i.putExtra("borderDp",b);i.putExtra("eyeWidth",ew);i.putExtra("eyeHeight",eh);i.putExtra("eyeGapDp",gap);i.putExtra("eyeShape",eyeShape);return i;
  }
  @PluginMethod public void hide(PluginCall call){Intent i=new Intent(getContext(),BosleyOverlayService.class);i.setAction(BosleyOverlayService.ACTION_HIDE);startOverlayService(i);JSObject r=new JSObject();r.put("visible",false);call.resolve(r);}
  @PluginMethod public void consumeLaunchAction(PluginCall call){
    android.content.Intent intent=getActivity().getIntent();
    String action=intent.getStringExtra("bosley_quick_action");
    intent.removeExtra("bosley_quick_action");
    CharSequence shared=intent.getCharSequenceExtra(android.content.Intent.EXTRA_PROCESS_TEXT);
    if(shared==null)shared=intent.getCharSequenceExtra(android.content.Intent.EXTRA_TEXT);
    String sharedText=shared==null?"":shared.toString().trim();
    if(sharedText.length()>12000)sharedText=sharedText.substring(0,12000);
    intent.removeExtra(android.content.Intent.EXTRA_PROCESS_TEXT);
    intent.removeExtra(android.content.Intent.EXTRA_TEXT);
    // Keep the fallback expression valid Java and return an empty action when absent.
    JSObject r=new JSObject();r.put("action",action==null?"":action);r.put("sharedText",sharedText);call.resolve(r);
  }
  @PluginMethod public void status(PluginCall call){JSObject r=new JSObject();r.put("available",true);r.put("granted",Build.VERSION.SDK_INT<23||Settings.canDrawOverlays(getContext()));call.resolve(r);}
}''')

activity = src / "MainActivity.java"
if not activity.exists():
    raise SystemExit("Generated MainActivity.java not found at expected Capacitor package path")
a=activity.read_text()
if "BosleyOverlayPlugin" not in a:
    replacement = """public class MainActivity extends BridgeActivity {
  @Override protected void onNewIntent(android.content.Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    String action=intent.getStringExtra("bosley_quick_action");
    boolean hasSharedText=intent.getCharSequenceExtra(android.content.Intent.EXTRA_PROCESS_TEXT)!=null||intent.getCharSequenceExtra(android.content.Intent.EXTRA_TEXT)!=null;
    if((action!=null && ("panel".equals(action)||"voice".equals(action)||"writing".equals(action)||"writing-card".equals(action)||"capture-screen".equals(action)))||hasSharedText){
      String js="window.dispatchEvent(new Event(String.fromCharCode(98,111,115,108,101,121,78,97,116,105,118,101,65,99,116,105,111,110)))";
      getBridge().getWebView().post(()->getBridge().getWebView().evaluateJavascript(js,null));
    }
  }
  @Override public void onCreate(android.os.Bundle savedInstanceState) {
    registerPlugin(BosleyOverlayPlugin.class);
    super.onCreate(savedInstanceState);
  }
}"""
    a,n=re.subn(r'public class MainActivity extends BridgeActivity \{\s*\}', lambda _: replacement, a)
    if n != 1:
        raise SystemExit("Could not safely add native overlay intent handoff to MainActivity")
    if "registerPlugin(BosleyOverlayPlugin.class)" not in a:
        raise SystemExit("Could not safely register native overlay plugin in MainActivity")
    if "String.fromCharCode(98,111,115,108,101,121,78,97,116,105,118,101,65,99,116,105,111,110)" not in replacement:
        raise SystemExit("Could not safely add the native floating widget tap event")
activity.write_text(a)
print("Installed native rounded floating widget service and Capacitor bridge.")
