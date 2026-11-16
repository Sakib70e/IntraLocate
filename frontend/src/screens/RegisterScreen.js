import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function RegisterScreen({ onNavigate }) {
  const { register } = useAuth();
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Required Fields', 'Please complete all required fields.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Invalid Password', 'Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await register(email.trim(), password, name.trim());
      onNavigate('orgSelect');
    } catch (err) {
      Alert.alert('Registration Failed', err.message || 'Unable to register account.');
    } finally {
      setLoading(false);
    }
  };

  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 44;

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.statusBarBg} />
      <KeyboardAvoidingView
        style={s.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={[s.scroll, { paddingTop: topInset }]}>
          <View style={s.topBar}>
            <TouchableOpacity onPress={() => onNavigate('landing')} style={s.backBtn}>
              <Text style={s.backBtnText}>&lt; Back</Text>
            </TouchableOpacity>
          </View>

          <View style={s.header}>
            <Text style={s.title}>Create Account</Text>
            <Text style={s.subtitle}>Register a new user account.</Text>
          </View>

          <View style={s.form}>
            <View style={s.inputGroup}>
              <Text style={s.label}>Full Name</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="Full Name"
                placeholderTextColor={theme.textPlaceholder}
              />
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Email Address</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.com"
                placeholderTextColor={theme.textPlaceholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Password (minimum 6 characters)</Text>
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor={theme.textPlaceholder}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Confirm Password</Text>
              <TextInput
                style={s.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                placeholderTextColor={theme.textPlaceholder}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={s.primaryBtn}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={theme.textBtnPrimary} size="small" />
              ) : (
                <Text style={s.primaryBtnText}>Register</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={() => onNavigate('login')}
              activeOpacity={0.8}
            >
              <Text style={s.secondaryBtnText}>Already have an account? Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    keyboardView: {
      flex: 1,
    },
    scroll: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    backBtn: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      backgroundColor: theme.bgBtnSecondary,
    },
    backBtnText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    header: {
      marginBottom: 24,
      borderBottomWidth: 2,
      borderBottomColor: theme.border,
      paddingBottom: 12,
    },
    title: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '800',
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 13,
      marginTop: 4,
    },
    form: {
      gap: 16,
    },
    inputGroup: {
      gap: 6,
    },
    label: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: theme.text,
      backgroundColor: theme.bgInput,
    },
    primaryBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
    },
    primaryBtnText: {
      color: theme.textBtnPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    secondaryBtn: {
      backgroundColor: theme.bgBtnSecondary,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 14,
      alignItems: 'center',
    },
    secondaryBtnText: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '600',
    },
  });
}
