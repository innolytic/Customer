/**
 * @format
 */

import {AppRegistry} from 'react-native';
import { LogBox } from 'react-native';
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  FlatList,
  TextInput,
  StyleSheet,
  Text,
  ActivityIndicator,
} from 'react-native';
import Realm from 'realm';
import {name as appName} from './app.json';

// API configurations
const CustomerSchema = {
  name: 'Customer',
  primaryKey: 'id',
  properties: {
    id: 'int',
    cgId: { type: 'string', optional: true },
    name: { type: 'string', optional: true },
    email: { type: 'string', optional: true },
    mobile: { type: 'string', optional: true },
  },
};

const API_URL = 'https://cgv2.creativegalileo.com/api/V1/customer/filter';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjZ0lkIjoxODkyODA1NCwiZW50aXR5VHlwZSI6ImN1c3RvbWVyIiwidiI6IjAuMSIsImlhdCI6MTczNTkwNDkyMywiZXhwIjoxNzY3NDYyNTIzfQ.WWKqzixvF9IcKbLCk594SrPVfzq9xChRqealREVnN4A';

const formatCustomer = (customer) => {
  if (!customer) return null;

  const id = parseInt(customer.id, 10);
  if (isNaN(id)) return null;

  return {
    id,
    cgId: String(customer.cgId || ''),
    name: String(customer.name || ''),
    email: String(customer.email || ''),
    mobile: String(customer.mobile || '')
  };
};

const fetchCustomers = async (pageNo, pageSize, searchQuery = '', sortBy = '', filterBy = '') => {
  try {
    const encodedSearch = encodeURIComponent(searchQuery.trim());
    const response = await fetch(
      `${API_URL}?paginated=true&pageNo=${pageNo}&pageSize=${pageSize}&search=${encodedSearch}&sort=${sortBy}&filter=${filterBy}`,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
        },
      }
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching customers:', error);
    throw error;
  }
};

const CustomerApp = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [realm, setRealm] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 50;

  // Initialize Realm
  useEffect(() => {
    const initRealm = async () => {
      try {
        const realmInstance = await Realm.open({
          schema: [CustomerSchema],
          schemaVersion: 1,
          migration: (oldRealm, newRealm) => {
            const oldObjects = oldRealm.objects('Customer');
            const newObjects = newRealm.objects('Customer');
          },
          deleteRealmIfMigrationNeeded: true // Remove this in production
        });
        setRealm(realmInstance);
      } catch (error) {
        console.error('Error initializing Realm:', error);
      }
    };

    initRealm();
    return () => {
      if (realm) {
        realm.close();
      }
    };
  }, []);

  // Load customers from API and store in Realm
  const loadCustomers = async (page = 1, refresh = false) => {
    if (loading) return;
    LogBox.ignoreAllLogs();
    setLoading(true);
    try {
      const response = await fetchCustomers(page, PAGE_SIZE, searchQuery);

      if (response.success && response.data?.customers) {
        const newCustomers = response.data.customers
          .map(formatCustomer)
          .filter(customer => customer !== null); // Remove invalid customers

        setTotalCount(response.data.count || 0);

        // Store in Realm
        realm.write(() => {
          newCustomers.forEach((customer) => {
            try {
              realm.create(
                'Customer',
                customer,
                Realm.UpdateMode.Modified
              );
            } catch (error) {
              console.error('Error creating customer in Realm:', error);
            }
          });
        });

        if (refresh) {
          setCustomers(newCustomers);
        } else {
          setCustomers((prev) => [...prev, ...newCustomers]);
        }
        setCurrentPage(page);
      }
    } catch (error) {
      console.error('Error loading customers:', error);
      // Load from Realm if API fails
      if (realm) {
        const realmCustomers = realm.objects('Customer');
        setCustomers(Array.from(realmCustomers));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (realm) {
      loadCustomers(1, true);
    }
  }, [realm]);

  useEffect(() => {
    if (realm) {
      const delayDebounceFn = setTimeout(() => {
        setCurrentPage(1);
        loadCustomers(1, true);
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [searchQuery]);

  // Render customer item with null check
  const renderItem = ({ item }) => {
    if (!item || typeof item.id !== 'number') return null;

    return (
      <View style={styles.customerItem}>
        <Text style={styles.customerName}>{item.name || 'No Name'}</Text>
        <Text>{item.cgId || 'No cgId'}</Text>
        <Text>{item.email || 'No Email'}</Text>
        <Text>{item.mobile || 'No Mobile'}</Text>
      </View>
    );
  };

  const keyExtractor = (item) => {
    if (!item || typeof item.id !== 'number') {
      console.warn('Invalid customer item:', item);
      return `invalid-${Math.random()}`; // Fallback unique key
    }
    return `customer-${item.id}`;
  };

  // Handle load more
  const handleLoadMore = () => {
    if (!loading && customers.length < totalCount) {
      loadCustomers(currentPage + 1);
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    setRefreshing(true);
    loadCustomers(1, true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.totalCount}>Total Customers: {totalCount}</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search customers..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={customers}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ListFooterComponent={() =>
          loading ? <ActivityIndicator size="large" color="#0000ff" /> : null
        }
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text>No customers found</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerContainer: {
    padding: 10,
    backgroundColor: '#f5f5f5',
  },
  totalCount: {
    fontSize: 14,
    marginBottom: 10,
    color: '#666',
  },
  searchInput: {
    height: 40,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  customerItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  customerName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
});

AppRegistry.registerComponent(appName, () => CustomerApp);

export default CustomerApp;