#!/usr/bin/env python3
import csv
import sys
from datetime import datetime

def analyze_airwallex_csv(filename):
    """Analyze Airwallex CSV and calculate card expenses for August 2025"""
    
    card_expenses_august = 0.0
    card_transactions_august = []
    all_transactions_august = []
    
    with open(filename, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            # Parse the date - it's in format "08-30-2025"
            date_str = row['Date completed (UTC)']
            try:
                date_obj = datetime.strptime(date_str, '%m-%d-%Y')
                month = date_obj.month
                year = date_obj.year
            except ValueError:
                print(f"Warning: Could not parse date: {date_str}")
                continue
            
            # Only process August 2025 transactions
            if month == 8 and year == 2025:
                transaction_type = row['Type']
                state = row['State']
                amount = float(row['Amount']) if row['Amount'] else 0.0
                description = row['Description']
                
                all_transactions_august.append({
                    'date': date_str,
                    'type': transaction_type,
                    'state': state,
                    'amount': amount,
                    'description': description,
                    'id': row['ID']
                })
                
                # Check if it's a card payment
                if transaction_type == 'CARD_PAYMENT' and state == 'COMPLETED' and amount < 0:
                    card_amount = abs(amount)
                    card_expenses_august += card_amount
                    card_transactions_august.append({
                        'date': date_str,
                        'amount': card_amount,
                        'description': description,
                        'id': row['ID']
                    })
    
    print(f"=== AIRWALLEX AUGUST 2025 ANALYSIS ===")
    print(f"Total card expenses: ${card_expenses_august:.2f}")
    print(f"Number of card transactions: {len(card_transactions_august)}")
    print(f"Total transactions in August: {len(all_transactions_august)}")
    
    print(f"\n=== CARD TRANSACTIONS DETAILS ===")
    for i, tx in enumerate(card_transactions_august, 1):
        print(f"{i:2d}. {tx['date']} - ${tx['amount']:8.2f} - {tx['description']}")
    
    print(f"\n=== ALL TRANSACTION TYPES IN AUGUST ===")
    type_counts = {}
    for tx in all_transactions_august:
        tx_type = tx['type']
        if tx_type not in type_counts:
            type_counts[tx_type] = 0
        type_counts[tx_type] += 1
    
    for tx_type, count in sorted(type_counts.items()):
        print(f"{tx_type}: {count} transactions")
    
    return card_expenses_august, card_transactions_august

if __name__ == "__main__":
    filename = "exports/airwallex-transaction-statement_01-Jul-2025_31-Aug-2025.csv"
    try:
        card_expenses, card_txs = analyze_airwallex_csv(filename)
        print(f"\n=== SUMMARY ===")
        print(f"Expected Airwallex card expenses for August 2025: ${card_expenses:.2f}")
    except FileNotFoundError:
        print(f"Error: File {filename} not found")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
