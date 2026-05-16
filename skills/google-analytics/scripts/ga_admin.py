#!/usr/bin/env python3

import os
import argparse
import sys
try:
    from google.analytics.admin_v1alpha import AnalyticsAdminServiceClient
    from google.analytics.admin_v1alpha.types import CreatePropertyRequest, Property, DataStream
except ImportError:
    print("Error: The 'google-analytics-admin' package is not installed.")
    print("Install it via: pip install google-analytics-admin")
    sys.exit(1)

def list_accounts(client):
    print("Listing Google Analytics Accounts...")
    results = client.list_accounts()
    for account in results:
        print(f"Account Name: {account.name}")
        print(f"Display Name: {account.display_name}")
        print("-" * 20)

def list_properties(client, account_name):
    print(f"Listing Properties for {account_name}...")
    # account_name format: 'accounts/123456789'
    results = client.list_properties(request={"filter": f"parent:{account_name}"})
    for prop in results:
        print(f"Property Name: {prop.name}")
        print(f"Display Name: {prop.display_name}")
        print("-" * 20)

def create_property(client, account_name, display_name):
    print(f"Creating Property '{display_name}' under {account_name}...")
    prop = Property(
        parent=account_name,
        display_name=display_name,
        time_zone="America/Los_Angeles",
    )
    request = CreatePropertyRequest(
        property=prop
    )
    response = client.create_property(request=request)
    print(f"Created Property: {response.name}")
    return response.name

def create_web_data_stream(client, property_name, stream_name, default_uri):
    print(f"Creating Web Data Stream for {property_name}...")
    stream = DataStream(
        display_name=stream_name,
        type_=DataStream.DataStreamType.WEB_DATA_STREAM,
        web_stream_data=DataStream.WebStreamData(
            default_uri=default_uri
        )
    )
    response = client.create_data_stream(
        parent=property_name,
        data_stream=stream
    )
    print(f"Created Data Stream: {response.name}")
    print(f"Measurement ID: {response.web_stream_data.measurement_id}")
    return response

def main():
    parser = argparse.ArgumentParser(description="Google Analytics 4 Admin Helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # list-accounts
    subparsers.add_parser("list-accounts", help="List all GA4 accounts")

    # list-properties
    prop_parser = subparsers.add_parser("list-properties", help="List properties under an account")
    prop_parser.add_argument("--account", required=True, help="Account resource name, e.g., accounts/123456")

    # create-property
    create_prop_parser = subparsers.add_parser("create-property", help="Create a new GA4 property")
    create_prop_parser.add_argument("--account", required=True, help="Account resource name")
    create_prop_parser.add_argument("--name", required=True, help="Display name for the property")

    # create-stream
    stream_parser = subparsers.add_parser("create-stream", help="Create a web data stream")
    stream_parser.add_argument("--property", required=True, help="Property resource name, e.g., properties/123456")
    stream_parser.add_argument("--name", required=True, help="Display name for the data stream")
    stream_parser.add_argument("--uri", required=True, help="Default URI, e.g., https://example.com")

    args = parser.parse_args()

    # Assumes GOOGLE_APPLICATION_CREDENTIALS is set in the environment
    try:
        client = AnalyticsAdminServiceClient()
    except Exception as e:
        print(f"Failed to initialize client: {e}")
        print("Make sure GOOGLE_APPLICATION_CREDENTIALS is set to a valid service account JSON key.")
        sys.exit(1)

    if args.command == "list-accounts":
        list_accounts(client)
    elif args.command == "list-properties":
        list_properties(client, args.account)
    elif args.command == "create-property":
        create_property(client, args.account, args.name)
    elif args.command == "create-stream":
        create_web_data_stream(client, args.property, args.name, args.uri)

if __name__ == "__main__":
    main()
