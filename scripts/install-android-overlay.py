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
if "android.permission.CAMERA" not in text:
    text = text.replace("<application", '<uses-permission android:name="android.permission.CAMERA" />\n    <application', 1)
if "android.permission.FOREGROUND_SERVICE" not in text:
    text = text.replace("<application", '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n    <application', 1)
if "android.permission.FOREGROUND_SERVICE_MICROPHONE" not in text:
    text = text.replace("<application", '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />\n    <application', 1)
if "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" not in text:
    text = text.replace("<application", '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />\n    <application', 1)
if "<queries>" not in text:
    text = text.replace("<application", '<queries><intent><action android:name="android.speech.RecognitionService" /></intent></queries>\n    <application', 1)
if "SYSTEM_ALERT_WINDOW" not in text:
    text = text.replace("<manifest ", '<manifest xmlns:tools="http://schemas.android.com/tools" ', 1) if 'xmlns:tools=' not in text else text
    text = text.replace("<application", '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />\n    <application', 1)
if "BosleyOverlayService" not in text:
    text = text.replace("</application>", '        <service android:name=".BosleyOverlayService" android:exported="false" android:foregroundServiceType="microphone" />\n    </application>')
if "BosleyScreenRecordingService" not in text:
    text = text.replace("</application>", '        <service android:name=".BosleyScreenRecordingService" android:exported="false" android:foregroundServiceType="mediaProjection" />\n    </application>')
manifest.write_text(text)
# The Android guide is intentionally stationary. Do not register an accessibility
# service to inspect other apps or automatically reposition the guide target.

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
import android.speech.SpeechRecognizer;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.os.Bundle;

public class BosleyOverlayService extends Service {
  static final String ACTION_SHOW="com.bosley.companion.SHOW_OVERLAY", ACTION_HIDE="com.bosley.companion.HIDE_OVERLAY", ACTION_STYLE="com.bosley.companion.STYLE_OVERLAY", ACTION_GUIDE="com.bosley.companion.SHOW_GUIDE", ACTION_HIDE_GUIDE="com.bosley.companion.HIDE_GUIDE", ACTION_TARGET="com.bosley.companion.GUIDE_TARGET_UPDATE";
  int widgetWidth=110,widgetHeight=38,cornerDp=22,borderDp=1,eyeWidth=10,eyeHeight=20,eyeGapDp=12; String eyeShape="soft-square";
  WindowManager wm; View bar; WindowManager.LayoutParams lp; SpeechRecognizer overlayRecognizer; TextToSpeech overlayTts; boolean voiceReply=false; View guideLine,guideCard,guideTarget; WindowManager.LayoutParams guideLineLp,guideCardLp,guideTargetLp; String guideInstruction="Follow the tether to the next step."; String guideTargetLabel="Target not searched yet"; TextView guideStatusView; float guideTargetX=.55f,guideTargetY=.55f;
  @Override public void onCreate(){super.onCreate();wm=(WindowManager)getSystemService(WINDOW_SERVICE);overlayTts=new TextToSpeech(this,status->{if(status==TextToSpeech.SUCCESS){overlayTts.setLanguage(java.util.Locale.getDefault());overlayTts.setSpeechRate(0.96f);}});}
  @Override public int onStartCommand(Intent i,int flags,int id){
    if(i!=null && "com.bosley.companion.STOP_SCREEN_RECORDING".equals(i.getAction())){Intent stop=new Intent(this,BosleyScreenRecordingService.class).setAction(BosleyScreenRecordingService.ACTION_STOP);startService(stop);return START_STICKY;}
    if(i!=null && ACTION_HIDE.equals(i.getAction())){removeBar();stopSelf();return START_NOT_STICKY;}
    if(i!=null && ACTION_HIDE_GUIDE.equals(i.getAction())){removeGuide();return START_STICKY;}
    if(i!=null && ACTION_TARGET.equals(i.getAction())){updateGuideTarget(i);return START_STICKY;}
    if(i!=null && ACTION_GUIDE.equals(i.getAction())){guideInstruction=i.getStringExtra("instruction")!=null?i.getStringExtra("instruction"):"Follow the tether to the next step.";if(!Settings.canDrawOverlays(this)){Intent p=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(p);return START_NOT_STICKY;}showGuide();return START_STICKY;}
    if(i!=null){widgetWidth=i.getIntExtra("widgetWidth",widgetWidth);widgetHeight=i.getIntExtra("widgetHeight",widgetHeight);cornerDp=i.getIntExtra("cornerDp",cornerDp);borderDp=i.getIntExtra("borderDp",borderDp);eyeWidth=i.getIntExtra("eyeWidth",eyeWidth);eyeHeight=i.getIntExtra("eyeHeight",eyeHeight);eyeGapDp=i.getIntExtra("eyeGapDp",eyeGapDp);eyeShape=i.getStringExtra("eyeShape")!=null?i.getStringExtra("eyeShape"):eyeShape;}
    if(ACTION_STYLE.equals(i==null?null:i.getAction())){removeBar();}
    if(!Settings.canDrawOverlays(this)){Intent p=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(p);return START_NOT_STICKY;}
    showBar();return START_STICKY;
  }
  void showBar(){if(bar!=null)return;
    LinearLayout frame=new LinearLayout(this);frame.setGravity(Gravity.CENTER);frame.setOrientation(LinearLayout.HORIZONTAL);
    GradientDrawable bg=new GradientDrawable();bg.setColor(Color.rgb(3,3,3));bg.setCornerRadius(dp(cornerDp));bg.setStroke(dp(borderDp),Color.WHITE);frame.setBackground(bg);frame.setPadding(dp(3),dp(3),dp(3),dp(3));
    LinearLayout inner=new LinearLayout(this);inner.setGravity(Gravity.CENTER);inner.setOrientation(LinearLayout.HORIZONTAL);
    GradientDrawable edge=new GradientDrawable();edge.setColor(Color.TRANSPARENT);edge.setCornerRadius(dp(Math.max(1,cornerDp-borderDp)));edge.setStroke(dp(1),0x66FFFFFF);inner.setBackground(edge);
    inner.setPadding(dp(3),dp(3),dp(3),dp(3));
    for(int n=0;n<2;n++){View eye=new View(this);GradientDrawable e=new GradientDrawable();e.setColor(Color.WHITE);e.setCornerRadius(dp("soft-square".equals(eyeShape)?6:Math.max(1,eyeWidth)));eye.setBackground(e);LinearLayout.LayoutParams ep=new LinearLayout.LayoutParams(dp(eyeWidth),dp(eyeHeight));if(n==1)ep.leftMargin=dp(eyeGapDp);inner.addView(eye,ep);}
    frame.addView(inner,new LinearLayout.LayoutParams(-1,-2));bar=frame;
    lp=new WindowManager.LayoutParams(dp(widgetWidth),dp(widgetHeight),Build.VERSION.SDK_INT>=26?WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY:WindowManager.LayoutParams.TYPE_PHONE,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT);
    lp.gravity=Gravity.TOP|Gravity.CENTER_HORIZONTAL;android.content.SharedPreferences positionPrefs=getSharedPreferences("bosley_overlay_position",MODE_PRIVATE);lp.x=positionPrefs.getInt("x",0);lp.y=positionPrefs.getInt("y",dp(7));
    frame.setOnTouchListener(new View.OnTouchListener(){float sx,sy;int ox,oy;long down;boolean moved,longPressed;Handler gestureHandler=new Handler(Looper.getMainLooper());Runnable holdAction=()->{longPressed=true;startOverlayVoice();};
      public boolean onTouch(View v,android.view.MotionEvent e){switch(e.getAction()){
        case MotionEvent.ACTION_DOWN:sx=e.getRawX();sy=e.getRawY();ox=lp.x;oy=lp.y;down=System.currentTimeMillis();moved=false;longPressed=false;gestureHandler.postDelayed(holdAction,480);return true;
        case MotionEvent.ACTION_MOVE:if(Math.abs(e.getRawX()-sx)>12||Math.abs(e.getRawY()-sy)>12){moved=true;gestureHandler.removeCallbacks(holdAction);int maxX=Math.max(0,(getResources().getDisplayMetrics().widthPixels-dp(widgetWidth))/2);int maxY=Math.max(0,getResources().getDisplayMetrics().heightPixels-dp(widgetHeight));lp.x=Math.max(-maxX,Math.min(maxX,ox+(int)(e.getRawX()-sx)));lp.y=Math.max(0,Math.min(maxY,oy+(int)(e.getRawY()-sy)));try{wm.updateViewLayout(bar,lp);}catch(Exception ignored){}}return true;
        case MotionEvent.ACTION_UP:gestureHandler.removeCallbacks(holdAction);if(moved)getSharedPreferences("bosley_overlay_position",MODE_PRIVATE).edit().putInt("x",lp.x).putInt("y",lp.y).apply();if(!moved&&!longPressed&&System.currentTimeMillis()-down<480)expandPanel();return true;
        case MotionEvent.ACTION_CANCEL:gestureHandler.removeCallbacks(holdAction);return true;
      }return true;}});
    try{wm.addView(bar,lp);}catch(Exception e){bar=null;}
  }
  LinearLayout chatPanel; EditText chatInput; TextView chatOutput; Button chatSend,chatVoice; Switch voiceInputToggle,voiceReplyToggle; ScrollView chatScroll; boolean chatRequestBusy=false,voiceInputEnabled=true,voiceRepliesEnabled=false;
  void expandPanel(){expandPanel(true);}
  void expandPanel(boolean showKeyboard){
    if(chatPanel!=null){try{wm.removeView(chatPanel);}catch(Exception ignored){}chatPanel=null;return;}
    LinearLayout panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);panel.setPadding(dp(12),dp(10),dp(12),dp(10));
    GradientDrawable bg=new GradientDrawable();bg.setColor(Color.rgb(12,14,19));bg.setCornerRadius(dp(18));bg.setStroke(dp(1),0xff555b68);panel.setBackground(bg);
    LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);
    TextView title=new TextView(this);title.setText("BOSLEY");title.setTextColor(Color.WHITE);title.setTextSize(12);title.setTypeface(null,1);header.addView(title,new LinearLayout.LayoutParams(0,dp(28),1));
    TextView app=new TextView(this);app.setText("APP ↗");app.setTextColor(0xffd9e3f5);app.setTextSize(10);app.setGravity(Gravity.CENTER);app.setPadding(dp(8),0,dp(8),0);header.addView(app,new LinearLayout.LayoutParams(dp(54),dp(28)));app.setOnClickListener(v->openCompanion("panel"));
    TextView close=new TextView(this);close.setText("×");close.setTextColor(Color.WHITE);close.setTextSize(22);close.setGravity(Gravity.CENTER);header.addView(close,new LinearLayout.LayoutParams(dp(28),dp(28)));close.setOnClickListener(v->{try{wm.removeView(chatPanel);}catch(Exception ignored){}chatPanel=null;});
    panel.addView(header);
    LinearLayout shortcuts=new LinearLayout(this);shortcuts.setGravity(Gravity.CENTER_VERTICAL);shortcuts.setPadding(0,dp(2),0,dp(4));
    String[] shortcutLabels={"AUTOMATION","AGENTS","OPEN APP"};String[] shortcutActions={"automation","providers","panel"};
    for(int n=0;n<shortcutLabels.length;n++){final String action=shortcutActions[n];TextView shortcut=new TextView(this);shortcut.setText(shortcutLabels[n]);shortcut.setTextColor(0xffd5d9e2);shortcut.setTextSize(9);shortcut.setGravity(Gravity.CENTER);GradientDrawable chip=new GradientDrawable();chip.setColor(0xff202633);chip.setCornerRadius(dp(8));shortcut.setBackground(chip);LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(0,dp(28),1);cp.setMargins(0,0,dp(5),0);shortcuts.addView(shortcut,cp);shortcut.setOnClickListener(v->openCompanion(action));}
    panel.addView(shortcuts);
    android.content.SharedPreferences voicePrefs=getSharedPreferences("bosley_overlay_preferences",MODE_PRIVATE);
    voiceInputEnabled=voicePrefs.getBoolean("voice_input_enabled",true);voiceRepliesEnabled=voicePrefs.getBoolean("voice_replies_enabled",false);
    LinearLayout voiceControls=new LinearLayout(this);voiceControls.setGravity(Gravity.CENTER_VERTICAL);voiceControls.setPadding(dp(2),dp(1),dp(2),dp(3));
    TextView voiceLabel=new TextView(this);voiceLabel.setText("VOICE");voiceLabel.setTextColor(0xffaeb8c9);voiceLabel.setTextSize(9);voiceLabel.setTypeface(null,1);voiceControls.addView(voiceLabel,new LinearLayout.LayoutParams(0,dp(34),1));
    voiceInputToggle=new Switch(this);voiceInputToggle.setText("Mic");voiceInputToggle.setTextColor(0xffe1e6ef);voiceInputToggle.setTextSize(10);voiceInputToggle.setChecked(voiceInputEnabled);voiceControls.addView(voiceInputToggle);voiceInputToggle.setOnCheckedChangeListener((button,checked)->{voiceInputEnabled=checked;voicePrefs.edit().putBoolean("voice_input_enabled",checked).apply();if(chatVoice!=null)chatVoice.setEnabled(checked&&!chatRequestBusy);if(!checked)stopOverlayVoice();});
    voiceReplyToggle=new Switch(this);voiceReplyToggle.setText("Speak replies");voiceReplyToggle.setTextColor(0xffe1e6ef);voiceReplyToggle.setTextSize(10);voiceReplyToggle.setChecked(voiceRepliesEnabled);voiceControls.addView(voiceReplyToggle);voiceReplyToggle.setOnCheckedChangeListener((button,checked)->{voiceRepliesEnabled=checked;voicePrefs.edit().putBoolean("voice_replies_enabled",checked).apply();});
    panel.addView(voiceControls);
    LinearLayout toolbox=new LinearLayout(this);toolbox.setOrientation(LinearLayout.VERTICAL);toolbox.setVisibility(View.GONE);toolbox.setPadding(0,dp(2),0,dp(5));
    String[][] toolRows={{"▣  SCREEN RECORD","▧  CAPTURE SCREEN","⚙  AUTOMATION"},{"✦  AGENTS","⌘  SKILLS","＋  PLUGINS"}};
    String[][] toolActions={{"screen-record","capture-screen","automation"},{"providers","skills","plugins"}};
    for(int r=0;r<toolRows.length;r++){LinearLayout toolRow=new LinearLayout(this);toolRow.setGravity(Gravity.CENTER);for(int c=0;c<toolRows[r].length;c++){final String action=toolActions[r][c];TextView tool=new TextView(this);tool.setText(toolRows[r][c]);tool.setTextColor(0xffe0e6f0);tool.setTextSize(8);tool.setGravity(Gravity.CENTER);tool.setSingleLine(true);tool.setEllipsize(android.text.TextUtils.TruncateAt.END);GradientDrawable toolBg=new GradientDrawable();toolBg.setColor(0xff202633);toolBg.setCornerRadius(dp(7));tool.setBackground(toolBg);LinearLayout.LayoutParams tp=new LinearLayout.LayoutParams(0,dp(29),1);tp.setMargins(0,0,dp(4),dp(4));toolRow.addView(tool,tp);tool.setOnClickListener(v->{toolbox.setVisibility(View.GONE);if("screen-record".equals(action)||"capture-screen".equals(action)||"automation".equals(action)||"providers".equals(action)||"skills".equals(action)||"plugins".equals(action))openCompanion(action);});}toolbox.addView(toolRow);}
    TextView stopRecord=new TextView(this);stopRecord.setText("■  STOP SCREEN RECORDING");stopRecord.setTextColor(0xffffc5c5);stopRecord.setTextSize(9);stopRecord.setGravity(Gravity.CENTER);stopRecord.setPadding(0,dp(5),0,dp(5));stopRecord.setVisibility(getSharedPreferences("bosley_screen_recording",MODE_PRIVATE).getBoolean("active",false)?View.VISIBLE:View.GONE);stopRecord.setOnClickListener(v->{Intent stop=new Intent(this,BosleyScreenRecordingService.class).setAction(BosleyScreenRecordingService.ACTION_STOP);startService(stop);stopRecord.setVisibility(View.GONE);appendChat("BOSLEY: Screen recording stopped. The video is saved in the Bosley app Movies folder.");});toolbox.addView(stopRecord);panel.addView(toolbox);
    chatScroll=new ScrollView(this);chatOutput=new TextView(this);chatOutput.setTextColor(0xffe8eaf0);chatOutput.setTextSize(13);chatOutput.setText("Ready. Messages are sent directly from this panel.");chatOutput.setPadding(dp(4),dp(8),dp(4),dp(8));chatScroll.addView(chatOutput);panel.addView(chatScroll,new LinearLayout.LayoutParams(-1,0,1));
    LinearLayout compose=new LinearLayout(this);compose.setGravity(Gravity.CENTER_VERTICAL);TextView plus=new TextView(this);plus.setText("＋");plus.setTextColor(Color.WHITE);plus.setTextSize(24);plus.setGravity(Gravity.CENTER);plus.setContentDescription("Open Bosley tools");GradientDrawable plusBg=new GradientDrawable();plusBg.setColor(0xff263044);plusBg.setShape(GradientDrawable.OVAL);plus.setBackground(plusBg);compose.addView(plus,new LinearLayout.LayoutParams(dp(36),dp(36)));plus.setOnClickListener(v->toolbox.setVisibility(toolbox.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE));chatInput=new EditText(this);chatInput.setSingleLine(false);chatInput.setMaxLines(2);chatInput.setTextColor(Color.WHITE);chatInput.setHintTextColor(0xff9ba3b4);chatInput.setHint("Message Bosley…");chatInput.setTextSize(14);compose.addView(chatInput,new LinearLayout.LayoutParams(0,dp(42),1));
    chatVoice=new Button(this);chatVoice.setText("🎙");chatVoice.setContentDescription("Talk to Bosley");GradientDrawable micBg=new GradientDrawable();micBg.setColor(0xff30394a);micBg.setShape(GradientDrawable.OVAL);chatVoice.setBackground(micBg);compose.addView(chatVoice,new LinearLayout.LayoutParams(dp(42),dp(42)));chatVoice.setEnabled(voiceInputEnabled);chatVoice.setOnClickListener(v->{if(voiceInputEnabled)startOverlayVoice();else appendChat("Turn Mic on in the Voice controls first.");});
    chatSend=new Button(this);chatSend.setText("Send");compose.addView(chatSend,new LinearLayout.LayoutParams(dp(60),dp(42)));panel.addView(compose);chatSend.setOnClickListener(v->sendOverlayMessage());
    WindowManager.LayoutParams params=new WindowManager.LayoutParams(Math.min(dp(360),getResources().getDisplayMetrics().widthPixels-dp(24)),Math.min(dp(360),getResources().getDisplayMetrics().heightPixels-dp(70)),Build.VERSION.SDK_INT>=26?WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY:WindowManager.LayoutParams.TYPE_PHONE,WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN|WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM,PixelFormat.TRANSLUCENT);
    params.gravity=Gravity.TOP|Gravity.CENTER_HORIZONTAL;params.y=dp(54);chatPanel=panel;
    try{wm.addView(panel,params);chatInput.requestFocus();panel.postDelayed(()->{try{if(showKeyboard){params.flags=WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN;wm.updateViewLayout(panel,params);android.view.inputmethod.InputMethodManager keyboard=(android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE);keyboard.showSoftInput(chatInput,android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);}}catch(Exception ignored){}},180);}catch(Exception e){chatPanel=null;Toast.makeText(this,"Could not open Bosley panel.",Toast.LENGTH_SHORT).show();}
  }
  void appendChat(String text){if(chatOutput==null)return;chatOutput.append("\n\n"+text);if(chatScroll!=null)chatScroll.post(()->chatScroll.fullScroll(View.FOCUS_DOWN));}
  boolean beginVoiceForeground(){
    try{
      if(Build.VERSION.SDK_INT>=26){
        String channelId="bosley-voice-session";
        android.app.NotificationManager manager=(android.app.NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(manager.getNotificationChannel(channelId)==null)manager.createNotificationChannel(new android.app.NotificationChannel(channelId,"Bosley voice session",android.app.NotificationManager.IMPORTANCE_LOW));
        android.app.Notification notification=new android.app.Notification.Builder(this,channelId).setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("Bosley is listening").setContentText("Voice input is active from your floating widget.").setCategory(android.app.Notification.CATEGORY_SERVICE).setOngoing(true).build();
        if(Build.VERSION.SDK_INT>=29)startForeground(73,notification,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);else startForeground(73,notification);
      }else{
        android.app.Notification notification=new android.app.Notification.Builder(this).setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("Bosley is listening").setContentText("Voice input is active from your floating widget.").setOngoing(true).build();
        startForeground(73,notification);
      }
      return true;
    }catch(Exception error){appendChat("BOSLEY: Android could not start a microphone session. Opening the normal voice screen instead.");return false;}
  }
  void endVoiceForeground(){try{if(Build.VERSION.SDK_INT>=24)stopForeground(STOP_FOREGROUND_REMOVE);else stopForeground(true);}catch(Exception ignored){}}
  void startOverlayVoice(){
    if(chatPanel==null)expandPanel(false);
    if(chatInput==null){appendChat("Open the Bosley panel before starting voice input.");return;}
    if(chatRequestBusy){appendChat("Bosley is still processing the previous request.");return;}
    if(Build.VERSION.SDK_INT>=23&&checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)!=android.content.pm.PackageManager.PERMISSION_GRANTED){
      appendChat("Microphone permission is needed. Opening Bosley once so Android can ask for permission; after granting it, voice can start directly from this floating panel.");
      openCompanion("voice");return;
    }
    if(!SpeechRecognizer.isRecognitionAvailable(this)){appendChat("Speech recognition is unavailable in the overlay. Opening Bosley voice as a fallback.");openCompanion("voice");return;}
    if(!beginVoiceForeground()){openCompanion("voice");return;}
    try{android.view.inputmethod.InputMethodManager inputMethod=(android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE);if(chatInput!=null)inputMethod.hideSoftInputFromWindow(chatInput.getWindowToken(),0);}catch(Exception ignored){}
    try{
      if(overlayRecognizer!=null){try{overlayRecognizer.destroy();}catch(Exception ignored){}overlayRecognizer=null;}
      overlayRecognizer=SpeechRecognizer.createSpeechRecognizer(this);
      overlayRecognizer.setRecognitionListener(new RecognitionListener(){
        public void onReadyForSpeech(Bundle params){appendChat("BOSLEY: Listening…");if(chatVoice!=null)chatVoice.setEnabled(false);}
        public void onBeginningOfSpeech(){}
        public void onRmsChanged(float rmsdB){}
        public void onBufferReceived(byte[] buffer){}
        public void onEndOfSpeech(){if(chatVoice!=null)chatVoice.setEnabled(true);}
        public void onError(int error){endVoiceForeground();if(chatVoice!=null)chatVoice.setEnabled(true);appendChat("BOSLEY: Voice input ended. Tap the microphone and try again (code "+error+").");}
        public void onResults(Bundle results){endVoiceForeground();if(chatVoice!=null)chatVoice.setEnabled(true);java.util.ArrayList<String> matches=results==null?null:results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);String spoken=matches==null||matches.isEmpty()?"":matches.get(0).trim();if(spoken.isEmpty()){appendChat("BOSLEY: I didn't catch that. Please try again.");return;}voiceReply=true;if(chatInput!=null)chatInput.setText(spoken);sendOverlayMessage();}
        public void onPartialResults(Bundle results){}
        public void onEvent(int eventType,Bundle params){}
      });
      Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
      intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
      intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true);
      intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,1);
      intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,java.util.Locale.getDefault().toLanguageTag());
      overlayRecognizer.startListening(intent);
    }catch(Exception error){if(chatVoice!=null)chatVoice.setEnabled(true);appendChat("BOSLEY: Could not start overlay voice. Opening the normal voice screen.");openCompanion("voice");}
  }
  void stopOverlayVoice(){try{if(overlayRecognizer!=null){overlayRecognizer.cancel();overlayRecognizer.destroy();overlayRecognizer=null;}}catch(Exception ignored){}endVoiceForeground();if(chatVoice!=null)chatVoice.setEnabled(voiceInputEnabled&&!chatRequestBusy);}
  void speakOverlayText(String text){try{if(overlayTts!=null&&text!=null&&!text.trim().isEmpty())overlayTts.speak(text,TextToSpeech.QUEUE_FLUSH,null,"bosley-overlay-reply");}catch(Exception ignored){}}
  String routeOverlayCommand(String message,String token,String anon,String base)throws Exception{
    String lower=message.trim();
    boolean phone=lower.matches("(?is)^(?:hey\\s+)?(?:bosley[, ]+)?(?:please\\s+)?(?:call|phone|dial)\\s+.+$")||lower.matches("(?is)^(?:hey\\s+)?(?:bosley[, ]+)?(?:please\\s+)?(?:send\\s+(?:a\\s+)?(?:text|message)|text|message|whatsapp)\\s+.+$");
    boolean automation=phone||lower.matches("(?is)^(?:hey\\s+)?(?:bosley[, ]+)?(?:please\\s+)?(?:open|launch|start|close|quit|switch to|go to|turn on|turn off|enable|disable|toggle|connect|disconnect|lock|unlock|wake up|sleep|mute|unmute|volume up|volume down|take a screenshot|capture the screen|move .+ to desktop \\d+|focus|minimize|maximize|click|tap|type|search|look up|play|pause|resume|stop|skip|next song|previous song)\\b.*$");
    if(!automation)return null;
    String endpoint=base+"/functions/v1/remote-action";
    org.json.JSONObject payload=new org.json.JSONObject().put("type",phone?"phone":"automation").put("instruction",lower);
    java.net.HttpURLConnection c=(java.net.HttpURLConnection)new java.net.URL(endpoint).openConnection();
    c.setRequestMethod("POST");c.setConnectTimeout(12000);c.setReadTimeout(20000);c.setDoOutput(true);
    c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("apikey",anon);
    c.getOutputStream().write(payload.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
    int status=c.getResponseCode();java.io.InputStream input=status>=200&&status<300?c.getInputStream():c.getErrorStream();
    java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();byte[] chunk=new byte[2048];int n;while(input!=null&&(n=input.read(chunk))>0)bytes.write(chunk,0,n);
    c.disconnect();org.json.JSONObject result=new org.json.JSONObject(bytes.toString("UTF-8"));
    if(status<200||status>=300||!result.optBoolean("ok",false))throw new Exception(result.optString("error",result.optString("telegramDetail","Automation gateway returned HTTP "+status)));
    if(phone&&!result.optBoolean("telegramNotified",false))throw new Exception(result.optString("telegramDetail","Telegram-to-MacroDroid delivery was not confirmed."));
    if(phone)return "Command delivered to the linked Telegram automation trigger. MacroDroid must have the matching Bosley notification rule enabled to carry it out.";
    return "Automation queued. Laptop listener notification: "+(result.optBoolean("listenerNotified",false)?"sent":"not confirmed")+". Telegram trigger: "+(result.optBoolean("telegramNotified",false)?"sent":"not confirmed")+".";
  }
  void sendOverlayMessage(){
    if(chatRequestBusy||chatInput==null)return;String message=chatInput.getText().toString().trim();if(message.isEmpty())return;
    chatInput.setText("");appendChat("YOU: "+message);chatRequestBusy=true;if(chatSend!=null)chatSend.setEnabled(false);if(chatVoice!=null)chatVoice.setEnabled(false);appendChat("BOSLEY: Thinking…");
    new Thread(()->{
      String answer="";String failure=null;
      try{
        android.content.SharedPreferences prefs=getSharedPreferences("bosley_native_chat",MODE_PRIVATE);
        String token=prefs.getString("access_token",""),anon=prefs.getString("anon_key",""),base=prefs.getString("supabase_url","");
        if(token.isEmpty()||anon.isEmpty()||base.isEmpty())throw new Exception("Sign in to Bosley once to enable the floating panel.");
        answer=routeOverlayCommand(message,token,anon,base);
        if(answer==null){
          java.net.HttpURLConnection connection=(java.net.HttpURLConnection)new java.net.URL(base+"/functions/v1/companion-chat").openConnection();
          connection.setRequestMethod("POST");connection.setConnectTimeout(15000);connection.setReadTimeout(45000);connection.setDoOutput(true);
          connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("apikey",anon);connection.setRequestProperty("Accept","text/event-stream");
          org.json.JSONArray messages=new org.json.JSONArray().put(new org.json.JSONObject().put("role","user").put("content",message));
          byte[] body=new org.json.JSONObject().put("messages",messages).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);connection.getOutputStream().write(body);
          int status=connection.getResponseCode();java.io.InputStream stream=status>=200&&status<300?connection.getInputStream():connection.getErrorStream();
          java.io.BufferedReader reader=new java.io.BufferedReader(new java.io.InputStreamReader(stream,java.nio.charset.StandardCharsets.UTF_8));String line;
          while((line=reader.readLine())!=null){if(!line.startsWith("data:"))continue;String data=line.substring(5).trim();if(data.isEmpty()||"[DONE]".equals(data))continue;try{org.json.JSONObject packet=new org.json.JSONObject(data);if(packet.has("error"))throw new Exception(packet.getJSONObject("error").optString("message","Bosley request failed."));org.json.JSONArray choices=packet.optJSONArray("choices");org.json.JSONObject delta=choices==null?null:choices.optJSONObject(0).optJSONObject("delta");if(delta!=null)answer+=delta.optString("content","");}catch(org.json.JSONException ignored){}}
          reader.close();connection.disconnect();if(status<200||status>=300)throw new Exception("Bosley returned HTTP "+status);if(answer.trim().isEmpty())throw new Exception("Bosley returned an empty response.");
        }
      }catch(Exception e){failure=e.getMessage()==null?"Connection failed.":e.getMessage();}
      final String result=answer,err=failure;final boolean shouldSpeak=voiceReply||getSharedPreferences("bosley_overlay_preferences",MODE_PRIVATE).getBoolean("voice_replies_enabled",false);voiceReply=false;
      new Handler(Looper.getMainLooper()).post(()->{if(chatOutput!=null){String current=chatOutput.getText().toString();int pos=current.lastIndexOf("\n\nBOSLEY: Thinking…");if(pos>=0)chatOutput.setText(current.substring(0,pos));String response=err==null?"BOSLEY: "+result:"BOSLEY: "+err;appendChat(response);if(shouldSpeak&&err==null)speakOverlayText(result);}chatRequestBusy=false;if(chatSend!=null)chatSend.setEnabled(true);if(chatVoice!=null)chatVoice.setEnabled(true);});
    }).start();
  }
  void openCompanion(String action){if(chatPanel!=null){try{wm.removeView(chatPanel);}catch(Exception ignored){}chatPanel=null;}Intent a=new Intent(BosleyOverlayService.this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);a.putExtra("bosley_quick_action",action);startActivity(a);}
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
    TextView body=new TextView(this);body.setText(guideInstruction+"\\nUse Find target to locate a matching visible control. Bosley does not click or type.");body.setTextColor(Color.LTGRAY);body.setTextSize(11);LinearLayout.LayoutParams bp=new LinearLayout.LayoutParams(-1,-2);bp.topMargin=dp(4);card.addView(body,bp);guideStatusView=body;
    Button find=new Button(this);find.setText("Find target");find.setTextColor(Color.WHITE);find.setOnClickListener(v->{String enabled=android.provider.Settings.Secure.getString(getContentResolver(),android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);if(enabled==null||!enabled.contains(getPackageName()+"/"+BosleyTargetAccessibilityService.class.getName())){Intent settings=new Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(settings);body.setText("Enable Bosley visual target finder in Accessibility settings, then return and tap Find target.");return;}Intent request=new Intent(BosleyTargetAccessibilityService.FIND);request.setPackage(getPackageName());request.putExtra("task",guideInstruction);sendBroadcast(request);body.setText("Searching visible controls…");});LinearLayout.LayoutParams fp=new LinearLayout.LayoutParams(-1,dp(36));fp.topMargin=dp(3);card.addView(find,fp);
    Button stop=new Button(this);stop.setText("Stop");stop.setTextColor(Color.WHITE);stop.setOnClickListener(v->removeGuide());LinearLayout.LayoutParams sp=new LinearLayout.LayoutParams(-1,dp(36));sp.topMargin=dp(2);card.addView(stop,sp);
    guideCard=card;guideCardLp=new WindowManager.LayoutParams(dp(250),WindowManager.LayoutParams.WRAP_CONTENT,Build.VERSION.SDK_INT>=26?WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY:WindowManager.LayoutParams.TYPE_PHONE,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT);guideCardLp.gravity=Gravity.TOP|Gravity.START;guideCardLp.x=dp(12);guideCardLp.y=dp(64);
    // Guide card remains in its default position; no drag listener.
    try{wm.addView(guideCard,guideCardLp);}catch(Exception e){guideCard=null;removeGuide();}
  }
  GradientDrawable circleTarget(){GradientDrawable d=new GradientDrawable();d.setShape(GradientDrawable.OVAL);d.setColor(Color.WHITE);d.setStroke(dp(3),Color.BLACK);return d;}
  void updateGuideTarget(Intent result){if(!result.getBooleanExtra("found",false)){if(guideStatusView!=null)guideStatusView.setText("No matching control found. Keep the target app visible and try a more specific instruction.");return;}guideTargetX=Math.max(0f,Math.min(1f,result.getFloatExtra("x",guideTargetX)));guideTargetY=Math.max(0f,Math.min(1f,result.getFloatExtra("y",guideTargetY)));guideTargetLabel=result.getStringExtra("label")!=null?result.getStringExtra("label"):"matching control";if(guideTarget!=null&&guideTargetLp!=null){DisplayMetrics dm=getResources().getDisplayMetrics();guideTargetLp.x=Math.max(0,(int)(dm.widthPixels*guideTargetX)-dp(21));guideTargetLp.y=Math.max(0,(int)(dm.heightPixels*guideTargetY)-dp(21));try{wm.updateViewLayout(guideTarget,guideTargetLp);}catch(Exception ignored){}}if(guideLine!=null)guideLine.invalidate();if(guideStatusView!=null)guideStatusView.setText("Target found: "+guideTargetLabel+". Visual guidance only; Bosley will not click or type.");}
  void removeGuide(){guideStatusView=null;if(wm!=null&&guideTarget!=null){try{wm.removeView(guideTarget);}catch(Exception ignored){}guideTarget=null;}if(wm!=null&&guideLine!=null){try{wm.removeView(guideLine);}catch(Exception ignored){}guideLine=null;}if(wm!=null&&guideCard!=null){try{wm.removeView(guideCard);}catch(Exception ignored){}guideCard=null;}}
  void removeBar(){if(wm!=null&&bar!=null){try{wm.removeView(bar);}catch(Exception ignored){}bar=null;}}
  int dp(float v){return (int)(v*getResources().getDisplayMetrics().density+.5f);}
  @Override public void onDestroy(){removeBar();if(chatPanel!=null){try{wm.removeView(chatPanel);}catch(Exception ignored){}chatPanel=null;}removeGuide();if(overlayRecognizer!=null){try{overlayRecognizer.destroy();}catch(Exception ignored){}overlayRecognizer=null;}endVoiceForeground();if(overlayTts!=null){try{overlayTts.stop();overlayTts.shutdown();}catch(Exception ignored){}overlayTts=null;}super.onDestroy();}
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
    startService(result);
  }
  @Override public void onDestroy(){if(receiver!=null){try{unregisterReceiver(receiver);}catch(Exception ignored){}}super.onDestroy();}
}''')

(src / "BosleyScreenRecordingService.java").write_text(r'''package com.bosley.companion;
import android.app.*;
import android.content.*;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.hardware.display.VirtualDisplay;
import android.hardware.display.DisplayManager;
import android.os.*;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class BosleyScreenRecordingService extends Service {
  static final String ACTION_STOP="com.bosley.companion.STOP_RECORDING";
  private MediaProjection projection;
  private VirtualDisplay display;
  private MediaRecorder recorder;
  private File output;
  private boolean started=false;
  @Override public int onStartCommand(Intent intent,int flags,int startId){
    if(intent!=null&&ACTION_STOP.equals(intent.getAction())){stopRecording();return START_NOT_STICKY;}
    if(started)return START_STICKY;
    try{
      if(Build.VERSION.SDK_INT>=26){
        String channel="bosley-screen-recording";
        NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(nm.getNotificationChannel(channel)==null)nm.createNotificationChannel(new NotificationChannel(channel,"Bosley screen recording",NotificationManager.IMPORTANCE_LOW));
        Notification notification=new Notification.Builder(this,channel).setSmallIcon(android.R.drawable.presence_video_online).setContentTitle("Bosley screen recorder").setContentText("Recording is active. Stop it from the floating panel.").setOngoing(true).setCategory(Notification.CATEGORY_SERVICE).build();
        if(Build.VERSION.SDK_INT>=29)startForeground(74,notification,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);else startForeground(74,notification);
      }else startForeground(74,new Notification.Builder(this).setSmallIcon(android.R.drawable.presence_video_online).setContentTitle("Bosley screen recorder").setContentText("Recording is active.").setOngoing(true).build());
      int resultCode=intent.getIntExtra("resultCode",0);
      Intent data;
      if(Build.VERSION.SDK_INT>=33)data=intent.getParcelableExtra("resultData",Intent.class);else data=(Intent)intent.getParcelableExtra("resultData");
      if(data==null)throw new IllegalStateException("Screen recording permission data is missing.");
      MediaProjectionManager manager=(MediaProjectionManager)getSystemService(MEDIA_PROJECTION_SERVICE);
      projection=manager.getMediaProjection(resultCode,data);
      if(projection==null)throw new IllegalStateException("Android did not grant screen recording.");
      DisplayMetrics metrics=new DisplayMetrics();((WindowManager)getSystemService(WINDOW_SERVICE)).getDefaultDisplay().getRealMetrics(metrics);
      int width=Math.max(2,metrics.widthPixels),height=Math.max(2,metrics.heightPixels),density=metrics.densityDpi;
      width-=width%2;height-=height%2;
      File folder=new File(getExternalFilesDir(Environment.DIRECTORY_MOVIES),"Bosley");
      if(!folder.exists()&&!folder.mkdirs())throw new IllegalStateException("Could not create the Bosley recordings folder.");
      String stamp=new SimpleDateFormat("yyyyMMdd-HHmmss",Locale.US).format(new Date());
      output=new File(folder,"Bosley-"+stamp+".mp4");
      recorder=Build.VERSION.SDK_INT>=31?new MediaRecorder(this):new MediaRecorder();
      recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
      recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
      recorder.setOutputFile(output.getAbsolutePath());
      recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
      recorder.setVideoSize(width,height);
      recorder.setVideoFrameRate(30);
      recorder.setVideoEncodingBitRate(Math.min(8000000,Math.max(2500000,width*height*4)));
      recorder.prepare();
      display=projection.createVirtualDisplay("BosleyScreenRecorder",width,height,density,DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,recorder.getSurface(),null,null);
      recorder.start();started=true;
      getSharedPreferences("bosley_screen_recording",MODE_PRIVATE).edit().putBoolean("active",true).putString("last_path",output.getAbsolutePath()).apply();
      return START_STICKY;
    }catch(Exception error){
      android.util.Log.e("BosleyScreenRecorder","Could not start recording",error);
      getSharedPreferences("bosley_screen_recording",MODE_PRIVATE).edit().putBoolean("active",false).apply();
      cleanup();stopForeground(true);stopSelf();return START_NOT_STICKY;
    }
  }
  private void stopRecording(){
    if(started){try{recorder.stop();}catch(Exception error){android.util.Log.w("BosleyScreenRecorder","Recording ended before a valid video frame was written",error);}started=false;}
    cleanup();
    getSharedPreferences("bosley_screen_recording",MODE_PRIVATE).edit().putBoolean("active",false).apply();
    if(output!=null&&output.exists()&&output.length()>0)android.widget.Toast.makeText(this,"Recording saved in Movies/Bosley",android.widget.Toast.LENGTH_LONG).show();
    stopForeground(true);stopSelf();
  }
  private void cleanup(){
    if(display!=null){try{display.release();}catch(Exception ignored){}display=null;}
    if(recorder!=null){try{recorder.reset();}catch(Exception ignored){}try{recorder.release();}catch(Exception ignored){}recorder=null;}
    if(projection!=null){try{projection.stop();}catch(Exception ignored){}projection=null;}
  }
  @Override public void onDestroy(){if(started)stopRecording();else cleanup();super.onDestroy();}
  @Override public android.os.IBinder onBind(Intent intent){return null;}
}''')

(src / "BosleyOverlayPlugin.java").write_text(r'''package com.bosley.companion;
import android.content.Intent;
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
@CapacitorPlugin(name="BosleyOverlay", permissions={@Permission(alias="microphone", strings={android.Manifest.permission.RECORD_AUDIO})})
public class BosleyOverlayPlugin extends Plugin {
  private android.speech.tts.TextToSpeech bosleyTts;
  private boolean bosleyTtsReady=false;
  private MediaProjection activeProjection;
  private VirtualDisplay captureDisplay;
  private ImageReader captureReader;
  private final Handler captureHandler=new Handler(Looper.getMainLooper());
  @PluginMethod public void syncAgentPreference(PluginCall call){
    String provider=call.getString("provider","");
    getContext().getSharedPreferences("bosley_native_chat",android.content.Context.MODE_PRIVATE).edit().putString("selected_provider",provider).apply();
    JSObject r=new JSObject();r.put("saved",true);call.resolve(r);
  }
  @PluginMethod public void requestScreenRecording(PluginCall call){
    if(Build.VERSION.SDK_INT<21){call.reject("Screen recording requires Android 5.0 or newer.");return;}
    MediaProjectionManager manager=(MediaProjectionManager)getContext().getSystemService(android.content.Context.MEDIA_PROJECTION_SERVICE);
    if(manager==null){call.reject("Android screen recording is unavailable.");return;}
    try{startActivityForResult(call,manager.createScreenCaptureIntent(),"screenRecordingPermissionResult");}
    catch(Exception e){call.reject("Could not open Android's screen-recording permission prompt.",e);}
  }
  @ActivityCallback private void screenRecordingPermissionResult(PluginCall call,ActivityResult result){
    if(result.getResultCode()!=android.app.Activity.RESULT_OK||result.getData()==null){call.resolve(new JSObject().put("cancelled",true));return;}
    try{
      Intent service=new Intent(getContext(),BosleyScreenRecordingService.class);
      service.putExtra("resultCode",result.getResultCode());service.putExtra("resultData",result.getData());
      if(Build.VERSION.SDK_INT>=26)getContext().startForegroundService(service);else getContext().startService(service);
      JSObject response=new JSObject();response.put("started",true);call.resolve(response);
    }catch(Exception e){call.reject("Could not start the screen recorder: "+String.valueOf(e.getMessage()),e);}
  }
  @PluginMethod public void stopScreenRecording(PluginCall call){
    Intent stop=new Intent(getContext(),BosleyScreenRecordingService.class).setAction(BosleyScreenRecordingService.ACTION_STOP);
    getContext().startService(stop);JSObject response=new JSObject();response.put("stopping",true);call.resolve(response);
  }
  @PluginMethod public void syncChatSession(PluginCall call){
    String token=call.getString("accessToken",""),anon=call.getString("anonKey",""),base=call.getString("supabaseUrl","");
    getContext().getSharedPreferences("bosley_native_chat",android.content.Context.MODE_PRIVATE).edit().putString("access_token",token).putString("anon_key",anon).putString("supabase_url",base).apply();
    JSObject r=new JSObject();r.put("saved",!token.isEmpty());call.resolve(r);
  }
  @PluginMethod public void speakText(PluginCall call){
    String text=call.getString("text","");
    String profile=call.getString("profile","jarvis");
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
            bosleyTts.setSpeechRate("jarvis".equals(profile)?0.9f:1.0f);
            bosleyTts.setPitch("jarvis".equals(profile)?0.78f:1.0f);
            bosleyTts.speak(utterance,android.speech.tts.TextToSpeech.QUEUE_FLUSH,null,"bosley-"+System.currentTimeMillis());
          }
        });
        JSObject r=new JSObject();r.put("queued",true);call.resolve(r);return;
      }
      if(!bosleyTtsReady){JSObject r=new JSObject();r.put("queued",false);r.put("reason","Android speech engine is still starting");call.resolve(r);return;}
      bosleyTts.setSpeechRate("jarvis".equals(profile)?0.9f:1.0f);
      bosleyTts.setPitch("jarvis".equals(profile)?0.78f:1.0f);
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
      MediaProjectionManager manager=(MediaProjectionManager)getContext().getSystemService(android.content.Context.MEDIA_PROJECTION_SERVICE);
      activeProjection=manager.getMediaProjection(result.getResultCode(),result.getData());
      if(activeProjection==null)throw new IllegalStateException("Android did not grant a screen-capture session.");
      WindowManager wm=(WindowManager)getContext().getSystemService(android.content.Context.WINDOW_SERVICE);
      DisplayMetrics metrics=new DisplayMetrics();wm.getDefaultDisplay().getRealMetrics(metrics);
      int width=Math.max(1,metrics.widthPixels),height=Math.max(1,metrics.heightPixels),density=metrics.densityDpi;
      captureReader=ImageReader.newInstance(width,height,PixelFormat.RGBA_8888,2);
      captureDisplay=activeProjection.createVirtualDisplay("BosleyScreenCapture",width,height,density,DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,captureReader.getSurface(),null,captureHandler);
      captureHandler.postDelayed(()->{
        try{
          Image image=captureReader.acquireLatestImage();
          if(image==null)throw new IllegalStateException("Android did not provide a screenshot frame. Please try again.");
          Bitmap bitmap=null;
          try{
            Image.Plane plane=image.getPlanes()[0];ByteBuffer buffer=plane.getBuffer();
            int pixelStride=plane.getPixelStride(),rowStride=plane.getRowStride(),rowPadding=rowStride-pixelStride*width;
            Bitmap padded=Bitmap.createBitmap(width+Math.max(0,rowPadding/pixelStride),height,Bitmap.Config.ARGB_8888);
            padded.copyPixelsFromBuffer(buffer);bitmap=Bitmap.createBitmap(padded,0,0,width,height);padded.recycle();
          }finally{image.close();}
          int max=1280; if(Math.max(width,height)>max){float scale=(float)max/Math.max(width,height);Bitmap scaled=Bitmap.createScaledBitmap(bitmap,Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)),true);bitmap.recycle();bitmap=scaled;}
          ByteArrayOutputStream out=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.JPEG,82,out);bitmap.recycle();
          JSObject response=new JSObject();response.put("ok",true);response.put("dataUrl","data:image/jpeg;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP));call.resolve(response);
        }catch(Exception e){call.reject("Screen capture failed: "+String.valueOf(e.getMessage()),e);}
        finally{cleanupScreenCapture();}
      },650);
    }catch(Exception e){cleanupScreenCapture();call.reject("Could not capture the Android screen: "+String.valueOf(e.getMessage()),e);}
  }
  private void cleanupScreenCapture(){
    if(captureDisplay!=null){try{captureDisplay.release();}catch(Exception ignored){}captureDisplay=null;}
    if(captureReader!=null){try{captureReader.close();}catch(Exception ignored){}captureReader=null;}
    if(activeProjection!=null){try{activeProjection.stop();}catch(Exception ignored){}activeProjection=null;}
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
    getContext().startService(i);
    JSObject r=new JSObject();r.put("visible",true);call.resolve(r);
  }
  @PluginMethod public void showGuide(PluginCall call){
    if(Build.VERSION.SDK_INT>=23&&!Settings.canDrawOverlays(getContext())){call.reject("Enable Android display-over-other-apps permission first.");return;}
    JSObject p=call.getObject("payload",new JSObject());String instruction=p.getString("instruction","Follow the tether to the next step.");
    Intent i=new Intent(getContext(),BosleyOverlayService.class);i.setAction(BosleyOverlayService.ACTION_GUIDE);i.putExtra("instruction",instruction);getContext().startService(i);
    JSObject r=new JSObject();r.put("ok",true);r.put("state","native-overlay-requested");call.resolve(r);
  }
  @PluginMethod public void stopGuide(PluginCall call){Intent i=new Intent(getContext(),BosleyOverlayService.class);i.setAction(BosleyOverlayService.ACTION_HIDE_GUIDE);getContext().startService(i);JSObject r=new JSObject();r.put("ok",true);call.resolve(r);}
  @PluginMethod public void setAppearance(PluginCall call){
    Intent i=styledIntent(call,BosleyOverlayService.ACTION_STYLE);getContext().startService(i);JSObject r=new JSObject();r.put("ok",true);call.resolve(r);
  }
  private Intent styledIntent(PluginCall call,String action){
    Intent i=new Intent(getContext(),BosleyOverlayService.class);i.setAction(action);
    JSObject p=call.getObject("payload",new JSObject());String size=p.getString("widgetSize","default"),edge=p.getString("widgetEdge","soft"),border=p.getString("widgetBorder","medium"),eyeShape=p.getString("eyeShape","pill"),eyeGap=p.getString("eyeGap","normal"),faceSize=p.getString("size","default");
    int w="compact".equals(size)?100:("wide".equals(size)?120:110),h="compact".equals(size)?36:("wide".equals(size)?42:38);int c="sharp".equals(edge)?18:("balanced".equals(edge)?20:22);int b="thin".equals(border)?1:("bold".equals(border)?3:2);int ew="compact".equals(faceSize)?9:("default".equals(faceSize)?10:12),eh="compact".equals(faceSize)?17:("default".equals(faceSize)?20:22);int gap="close".equals(eyeGap)?8:("wide".equals(eyeGap)?16:12);
    i.putExtra("widgetWidth",w);i.putExtra("widgetHeight",h);i.putExtra("cornerDp",c);i.putExtra("borderDp",b);i.putExtra("eyeWidth",ew);i.putExtra("eyeHeight",eh);i.putExtra("eyeGapDp",gap);i.putExtra("eyeShape",eyeShape);return i;
  }
  @PluginMethod public void hide(PluginCall call){Intent i=new Intent(getContext(),BosleyOverlayService.class);i.setAction(BosleyOverlayService.ACTION_HIDE);getContext().startService(i);JSObject r=new JSObject();r.put("visible",false);call.resolve(r);}
  @PluginMethod public void consumeLaunchAction(PluginCall call){
    String action=getActivity().getIntent().getStringExtra("bosley_quick_action");
    getActivity().getIntent().removeExtra("bosley_quick_action");
    JSObject r=new JSObject();r.put("action",action==null?"":action);call.resolve(r);
  }
  @PluginMethod public void status(PluginCall call){JSObject r=new JSObject();r.put("available",true);r.put("granted",Build.VERSION.SDK_INT<23||Settings.canDrawOverlays(getContext()));call.resolve(r);}
}''')
activity = src / "MainActivity.java"
if not activity.exists():
    raise SystemExit("Generated MainActivity.java not found at expected Capacitor package path")
a=activity.read_text()
if "BosleyOverlayPlugin" not in a:
    a=a.replace("import com.getcapacitor.BridgeActivity;", "import com.getcapacitor.BridgeActivity;\nimport com.getcapacitor.Plugin;\nimport java.util.ArrayList;\nimport java.util.List;")
    a=re.sub(r'public class MainActivity extends BridgeActivity \{\s*\}', 'public class MainActivity extends BridgeActivity {\n  @Override protected void onNewIntent(android.content.Intent intent) {\n    super.onNewIntent(intent);\n    setIntent(intent);\n  }\n  @Override public void onCreate(android.os.Bundle savedInstanceState) {\n    registerPlugin(BosleyOverlayPlugin.class);\n    super.onCreate(savedInstanceState);\n  }\n}', a)
    if "setIntent(intent)" not in a or "onNewIntent" not in a:
        raise SystemExit("Could not safely add intent handoff handling to MainActivity")
    if "registerPlugin(BosleyOverlayPlugin.class)" not in a:
        raise SystemExit("Could not safely register native overlay plugin in MainActivity")
activity.write_text(a)
print("Installed native rounded floating widget service and Capacitor bridge.")
