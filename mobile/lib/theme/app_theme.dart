import 'package:flutter/material.dart';

class AppColors {
  static const ink = Color(0xFF1B2738);
  static const muted = Color(0xFF7A879B);
  static const cream = Color(0xFFF9F4EA);
  static const creamDark = Color(0xFFF0E7D4);
  static const terracotta = Color(0xFFC94C28);
  static const green = Color(0xFF176B48);
  static const greenBright = Color(0xFF20935D);
  static const teal = Color(0xFF158D8E);
  static const amber = Color(0xFFA87300);
  static const line = Color(0xFFE6DAC5);
}

ThemeData buildAppTheme() {
  final base = ThemeData.light(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: AppColors.cream,
    colorScheme: const ColorScheme.light(
      primary: AppColors.terracotta,
      onPrimary: Colors.white,
      secondary: AppColors.green,
      onSecondary: Colors.white,
      surface: AppColors.cream,
      onSurface: AppColors.ink,
      outline: AppColors.line,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.cream,
      foregroundColor: AppColors.ink,
      elevation: 0,
      centerTitle: false,
    ),
    textTheme: base.textTheme.apply(
      bodyColor: AppColors.ink,
      displayColor: AppColors.ink,
      fontFamily: 'Arial',
    ),
    dividerColor: AppColors.line,
    splashFactory: InkSparkle.splashFactory,
  );
}
