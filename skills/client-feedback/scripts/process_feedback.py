#!/usr/bin/env python3
import argparse
import subprocess
import json
import os
import base64
import sys
from datetime import datetime, timedelta

def run_gws(service, resource, method, params=None, body=None, fields=None):
    cmd = ["gws", service, *resource.split("."), method]
    merged_params = dict(params) if params else {}
    if fields:
        merged_params["fields"] = fields
    if merged_params:
        cmd.extend(["--params", json.dumps(merged_params)])
    if body:
        cmd.extend(["--json", json.dumps(body)])
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error running gws: {result.stderr}", file=sys.stderr)
        return None
    
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return result.stdout

def search_emails(query):
    print(f"Searching for: {query}...")
    res = run_gws("gmail", "users.messages", "list", 
                 params={"userId": "me", "q": query}, 
                 fields="messages(id,threadId)")
    return res.get("messages", []) if res else []

def get_message(msg_id):
    return run_gws("gmail", "users.messages", "get", 
                  params={"userId": "me", "id": msg_id, "format": "full"})

def download_attachment(msg_id, part_id, filename, output_dir):
    res = run_gws("gmail", "users.messages.attachments", "get", 
                  params={"userId": "me", "messageId": msg_id, "id": part_id})
    if not res:
        return None
    
    data = res.get("data", "").replace("-", "+").replace("_", "/")
    content = base64.b64decode(data + "==")
    
    path = os.path.join(output_dir, filename)
    with open(path, "wb") as f:
        f.write(content)
    return path

def extract_body(payload):
    if "parts" in payload:
        for part in payload["parts"]:
            body = extract_body(part)
            if body: return body
    if payload.get("mimeType") == "text/plain":
        data = payload.get("body", {}).get("data", "")
        return base64.urlsafe_b64decode(data).decode("utf-8")
    return ""

def main():
    parser = argparse.ArgumentParser(description="Deterministic Client Feedback Processor")
    parser.add_argument("--domain", help="Client domain to search for (e.g. example.com)")
    parser.add_argument("--from", dest="sender", help="Specific sender email")
    parser.add_argument("--days", type=int, default=7, help="Number of days to look back")
    parser.add_argument("--out", default="./feedback_report", help="Output directory")
    
    args = parser.parse_args()
    
    if not args.domain and not args.sender:
        print("Error: Must provide either --domain or --from", file=sys.stderr)
        sys.exit(1)
    
    date_since = (datetime.now() - timedelta(days=args.days)).strftime("%Y/%m/%d")
    query = f"after:{date_since} "
    if args.domain:
        query += f"from:{args.domain}"
    else:
        query += f"from:{args.sender}"
    
    messages = search_emails(query)
    if not messages:
        print("No feedback emails found.")
        return

    os.makedirs(args.out, exist_ok=True)
    attachments_dir = os.path.join(args.out, "attachments")
    os.makedirs(attachments_dir, exist_ok=True)
    
    report = {
        "generated_at": datetime.now().isoformat(),
        "query": query,
        "threads": {}
    }

    for m in messages:
        msg = get_message(m["id"])
        if not msg: continue
        
        headers = {h["name"]:
 h["value"] for h in msg["payload"]["headers"]}
        subject = headers.get("Subject", "No Subject")
        sender = headers.get("From", "Unknown")
        date = headers.get("Date", "Unknown")
        thread_id = msg["threadId"]
        
        if thread_id not in report["threads"]:
            report["threads"][thread_id] = {
                "subject": subject,
                "participants": set(),
                "messages": []
            }
        
        report["threads"][thread_id]["participants"].add(sender)
        
        body = extract_body(msg["payload"])
        
        attachments = []
        def find_attachments(parts):
            for p in parts:
                if "parts" in p:
                    find_attachments(p["parts"])
                if p.get("filename") and p.get("body", {}).get("attachmentId"):
                    att_id = p["body"]["attachmentId"]
                    filename = f"{m['id']}_{p['filename']}"
                    path = download_attachment(m["id"], att_id, filename, attachments_dir)
                    if path:
                        attachments.append({"filename": p["filename"], "local_path": path})

        if "parts" in msg["payload"]:
            find_attachments(msg["payload"]["parts"])

        report["threads"][thread_id]["messages"].append({
            "id": m["id"],
            "date": date,
            "from": sender,
            "body_snippet": body[:500] + "..." if len(body) > 500 else body,
            "full_body_path": os.path.join(args.out, f"{m['id']}_body.txt"),
            "attachments": attachments
        })
        
        with open(os.path.join(args.out, f"{m['id']}_body.txt"), "w") as f:
            f.write(body)

    # Convert sets to lists for JSON serialization
    for t in report["threads"].values():
        t["participants"] = list(t["participants"])

    report_path = os.path.join(args.out, "report.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"\n✅ Feedback report generated in: {args.out}")
    print(f"Summary: {len(messages)} messages across {len(report['threads'])} threads.")
    print(f"Agent instructions: Read {report_path} to begin triaging issues.")

if __name__ == "__main__":
    main()
