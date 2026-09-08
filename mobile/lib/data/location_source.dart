import 'package:geolocator/geolocator.dart';

import '../models/mobility_models.dart';

enum LocationPermissionState { granted, denied, deniedForever, serviceDisabled }

abstract interface class LocationSource {
  Future<LocationPermissionState> requestPermission();
  Future<LocationSample?> getCurrentLocation() async => null;
  Stream<LocationSample> get locationStream;
  Future<void> stop();
}

class GeolocatorLocationSource implements LocationSource {
  @override
  Future<LocationPermissionState> requestPermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return LocationPermissionState.serviceDisabled;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    return switch (permission) {
      LocationPermission.whileInUse ||
      LocationPermission.always => LocationPermissionState.granted,
      LocationPermission.deniedForever => LocationPermissionState.deniedForever,
      LocationPermission.denied => LocationPermissionState.denied,
      LocationPermission.unableToDetermine => LocationPermissionState.denied,
    };
  }

  @override
  Future<LocationSample?> getCurrentLocation() async {
    final position = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
      ),
    );

    return LocationSample(
      timestamp: position.timestamp,
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      speed: position.speed,
      heading: position.heading,
    );
  }

  @override
  Stream<LocationSample> get locationStream =>
      Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 20,
        ),
      ).map(
        (position) => LocationSample(
          timestamp: position.timestamp,
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy,
          speed: position.speed,
          heading: position.heading,
        ),
      );

  @override
  Future<void> stop() async {}
}
